// main.js
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { getMainWindow, setMainWindow } = require('./utils/windowManager');
const { createMapWindow, createGalleryWindow } = require('./utils/imageViewerManager');
const { initialize: initializeDiscordService } = require('./discord/service');
require('dotenv').config();

// Initialize Express server
const PORT = process.env.DISCORD_AUTOMATION_SERVER_PORT || 3137;
const server = express();
server.use(bodyParser.json());
server.use(express.json());

// Initialize Discord Service
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken || botToken === 'your_bot_token_here') {
    console.error('Discord bot token not configured. Please set DISCORD_BOT_TOKEN in .env file.');
    app.quit();
    return;
}

console.log('Initializing Discord service...');
initializeDiscordService(botToken).catch(error => {
    console.error('Failed to initialize Discord service:', error);
    app.quit();
});

// Routes (after Discord service initialization)
const messageRoute = require('./routes/discord/message');
const commandRoute = require('./routes/discord/command');
const healthRoute = require('./routes/health');
const mapRendererRoute = require('./routes/renderer/map');
const mapRoute = require('./routes/discord/map');
const imageRoute = require('./routes/discord/image');

// Register routes
server.use('/discord/message', messageRoute);
server.use('/discord/command', commandRoute);
server.use('/health', healthRoute);
server.use('/renderer/map', mapRendererRoute);
server.use('/discord/map', mapRoute);
server.use('/discord/image', imageRoute);

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'assets', 'gen_ai.icns'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            experimentalFeatures: true,
        },
    });

    setMainWindow(win);

    // Create map and gallery windows
    createMapWindow();
    createGalleryWindow();

    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
    );

    // Load Discord
    win.loadURL('https://discord.com/login');
    
    // When Discord is loaded, inject our automation script
    win.webContents.on('did-finish-load', () => {
        const scriptPath = path.join(__dirname, 'renderer', 'automationRenderer.js');
        console.log('Injecting automation script from:', scriptPath);
        
        // Read the script content
        const fs = require('fs');
        try {
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            win.webContents.executeJavaScript(scriptContent)
                .then(() => {
                    console.log('Automation script injected successfully');
                })
                .catch(err => {
                    console.error('Failed to execute automation script:', err);
                });
        } catch (err) {
            console.error('Failed to read automation script:', err);
        }
    });
    
    // Open DevTools by default for debugging
    // win.webContents.openDevTools();
}

// App Initialization
app.whenReady().then(() => {
    createWindow();

    // Create the menu after the window is ready
    const menu = Menu.buildFromTemplate([
        {
            label: 'Automation',
            submenu: [
                {
                    label: 'Toggle DevTools',
                    accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
                    click: function() {
                        const win = getMainWindow();
                        if (win) {
                            win.webContents.toggleDevTools();
                        }
                    }
                }
            ],
        },
    ]);
    Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
