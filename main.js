const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const express = require('express');
const fs = require('fs');
const path = require('path');

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
            preload: path.join(__dirname, 'preload.js')
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
                            await startAutomation(win);
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

// Ensure the clipboard is set to only the incoming message text
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
            // Log and set clipboard explicitly with only the message text
            console.log("Setting clipboard with message:", message);
            clipboard.writeText(message);

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

// Define automation script to run in renderer process
function automationScript(win, botUsername, humanUsername) {
    return new Promise(function (resolve) {
        function automation(HUMAN_USERNAME, BOT_USERNAME) {
            const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
            const CHECK_INTERVAL = 2000;

            async function pasteMessage(messageBox) {
                messageBox.focus();

                const text = await window.clipboard.readText();
                console.log("Pasting message:", text); // Log to verify message content

                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: new DataTransfer(),
                    bubbles: true,
                });
                pasteEvent.clipboardData.setData('text/plain', text);
                messageBox.dispatchEvent(pasteEvent);
                messageBox.dispatchEvent(new Event('input', { bubbles: true }));
            }

            async function sendCommand() {
                const messageBox = document.querySelector(MESSAGE_BOX_SELECTOR);
                if (messageBox) {
                    await pasteMessage(messageBox);

                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                    });
                    messageBox.dispatchEvent(enterEvent);
                } else {
                    console.error('Message box not found');
                }
            }

            sendCommand();
        }

        win.webContents.executeJavaScript(
            `(${automation})(${JSON.stringify(humanUsername)}, ${JSON.stringify(botUsername)})`
        ).then(resolve);
    });
}

// Function to load and run automation script from file
async function startAutomation(win) {
    console.log("----- Starting automation -----");
    const scriptPath = path.join(__dirname, 'automation.js');
    const automationScript = fs.readFileSync(scriptPath, 'utf8');

    await win.webContents.executeJavaScript(`(${automationScript})(${JSON.stringify(HUMAN_USERNAME)})`);
}

app.whenReady().then(function () {
    createWindow();
    startRestServer();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    console.log("----- That's all folks! -----");
    if (process.platform !== 'darwin') app.quit();
});
