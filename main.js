// main.js
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const express = require('express');
const path = require('path');

let win;
const SERVER_PORT = 3000;
let automationStarted = false;

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Load the preload script
            nodeIntegration: false, // Disable nodeIntegration for security
            contextIsolation: true, // Enable contextIsolation for security
            // Enable experimental features to allow DataTransfer in paste event
            experimentalFeatures: true,
        },
    });

    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
    );
    win.loadURL('https://discord.com/login');
    win.webContents.openDevTools();

    // No need to load the automation script here
}

function startRestServer() {
    console.log("----- Starting REST server -----");
    const server = express();
    server.use(express.json());

    const messageQueue = [];
    let isProcessingQueue = false;
    const pendingMessages = new Map();

    function enqueueMessage(win, messageText, botUsername, humanUsername) {
        return new Promise((resolve, reject) => {
            const messageId = Date.now() + Math.random(); // Unique ID for the message
            messageQueue.push({ messageId, messageText, botUsername, humanUsername, resolve, reject });
            processQueue(win);
        });
    }

    function processQueue(win) {
        if (isProcessingQueue || messageQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;

        const { messageId, messageText, botUsername, humanUsername, resolve, reject } = messageQueue.shift();

        // Store resolve and reject functions for later use
        pendingMessages.set(messageId, { resolve, reject });

        // Send message to renderer
        console.log(`Sending message to renderer: ${messageText}`);
        win.webContents.send('send-message-to-renderer', { messageId, messageText, botUsername, humanUsername });

        // Timeout handling
        setTimeout(() => {
            if (pendingMessages.has(messageId)) {
                pendingMessages.get(messageId).reject('Timeout waiting for bot response');
                pendingMessages.delete(messageId);
                isProcessingQueue = false;
                processQueue(win); // Process next message in the queue
            }
        }, 60000); // 60 seconds timeout
    }

    // IPC handler for message responses from renderer
    ipcMain.on('message-response', (event, { messageId, response }) => {
        console.log(`Received response for messageId ${messageId}: ${response}`);
        if (pendingMessages.has(messageId)) {
            const { resolve } = pendingMessages.get(messageId);
            resolve(response);
            pendingMessages.delete(messageId);
        }
        isProcessingQueue = false;
        processQueue(win); // Process next message in the queue
    });

    server.post('/send-message', async function (req, res) {
        const { message, botUsername, humanUsername } = req.body;

        if (!message || !botUsername || !humanUsername) {
            return res.status(400).send("Message, botUsername, and humanUsername are required.");
        }

        if (!automationStarted) {
            return res.status(400).send("Automation not started. Please start automation via the Menu.");
        }

        try {
            // Enqueue the message and wait for response
            const response = await enqueueMessage(win, message, botUsername, humanUsername);

            // Return the response to the client
            res.json({ response });
        } catch (error) {
            console.error("Automation error:", error);
            res.status(500).send("Failed to retrieve response: " + error);
        }
    });

    server.listen(SERVER_PORT, function () {
        console.log(`REST server listening on port ${SERVER_PORT}`);
    });
}

// App Initialization
app.whenReady().then(() => {
    createWindow();
    startRestServer();

    // Create the menu after the window is ready
    const menu = Menu.buildFromTemplate([
        {
            label: 'Automation',
            submenu: [
                {
                    label: 'Start Automation',
                    click: function () {
                        if (automationStarted) {
                            console.log("Automation already started.");
                            return;
                        }

                        // Send message to renderer to start automation
                        console.log("Starting automation...");
                        win.webContents.send('start-automation');
                        automationStarted = true;
                        console.log("Automation script started in renderer process.");
                    }
                },
            ],
        },
    ]);
    Menu.setApplicationMenu(menu);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    console.log("----- That's all folks! -----");
    app.quit();
});
