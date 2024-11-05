const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const express = require('express');
const path = require('path');
const automationScript = require('./automation'); // Import automationScript from automation.js

let win;
const HUMAN_USERNAME = 'manu_mercs';
const SERVER_PORT = 3000;

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js') // Load the preload script
        },
    });
    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
    );
    win.loadURL('https://discord.com/login');
    win.webContents.openDevTools();

    const menu = Menu.buildFromTemplate([
        {
            label: 'Automation',
            submenu: [
                {
                    label: 'Start Automation Test',
                    click: async function () {
                        try {
                            await automationScript(win, 'bot_username', HUMAN_USERNAME);
                            console.log("Automation completed successfully.");
                        } catch (error) {
                            console.error("Automation encountered an error:", error);
                        }
                    }
                },
            ],
        },
    ]);
    Menu.setApplicationMenu(menu);
}

function startRestServer() {
    console.log("----- Starting REST server -----");
    const server = express();
    server.use(express.json());

    server.post('/send-message', async function (req, res) {
        const { message, botUsername, humanUsername } = req.body;
    
        if (!message || !botUsername || !humanUsername) {
            return res.status(400).send("Message, botUsername, and humanUsername are required.");
        }
    
        try {
            // Clear the clipboard to prevent any stale data
            clipboard.clear();
            
            // Set the message to the clipboard and log it
            clipboard.writeText(message);
            console.log("Clipboard content set to:", clipboard.readText());
    
            // Send message directly to renderer via IPC, bypassing clipboard read
            win.webContents.send('send-message-to-renderer', message);
    
            // Start the automation script
            const response = await automationScript(win, botUsername, humanUsername);
            res.json({ response });
        } catch (error) {
            console.error("Automation error:", error);
            res.status(500).send("Failed to retrieve response.");
        }
    });
    

    server.listen(SERVER_PORT, function () {
        console.log(`REST server listening on port ${SERVER_PORT}`);
    });
}

// IPC handlers for clipboard actions in the main process
ipcMain.handle('clipboard-read', async () => clipboard.readText());
ipcMain.on('clipboard-write', (event, text) => clipboard.writeText(text));

// App Initialization
app.whenReady().then(() => {
    createWindow();
    startRestServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    console.log("----- That's all folks! -----");
    app.quit();
});
