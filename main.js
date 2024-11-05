const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron');
const express = require('express');
const fs = require('fs');
const path = require('path');

let win;
const HUMAN_USERNAME = 'manu_mercs';
const SERVER_PORT = 3000;

// Handler for clipboard-read
ipcMain.handle('clipboard-read', async () => {
    return clipboard.readText();
});

// Handler for clipboard-write
ipcMain.on('clipboard-write', (event, text) => {
    clipboard.writeText(text);
});


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

// Start the REST server to receive automation requests
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
            // Set the message text on the clipboard
            clipboard.writeText(message);
            console.log("Clipboard content set to:", clipboard.readText());

            // Start automation script in the renderer
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

function automationScript(win, botUsername, humanUsername) {
    return new Promise(function (resolve) {
        function automation(HUMAN_USERNAME, BOT_USERNAME) {
            const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
            const MESSAGE_ITEM_CLASS = '.messageListItem_d5deea';
            const MESSAGE_USERNAME_CLASS = '.username_f9f2ca';
            const MESSAGE_CONTENT_CLASS = '.markup_f8f345';
            const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
            const CHECK_INTERVAL = 2000;
            const processedMessages = {};

            async function pasteMessage(messageBox) {
                messageBox.focus();

                const text = await window.clipboard.readText();
                
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

            function readNewMessages() {
                const messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
                if (!messageContainer) return;

                const messages = messageContainer.querySelectorAll(MESSAGE_ITEM_CLASS);
                messages.forEach((message) => {
                    const messageId = message.getAttribute('id');
                    if (processedMessages[messageId]) return;
                    processedMessages[messageId] = true;

                    const sender = message.querySelector(MESSAGE_USERNAME_CLASS)?.innerText || 'Unknown';
                    const contentElement = message.querySelector(MESSAGE_CONTENT_CLASS);
                    const content = contentElement ? contentElement.innerText : '';

                    if (sender === BOT_USERNAME && content) {
                        console.log("Bot response found:", content);
                        resolve(content); // Resolve with the bot's response
                    }
                });
            }

            sendCommand();

            setInterval(readNewMessages, CHECK_INTERVAL);
        }

        win.webContents.executeJavaScript(
            `(${automation})(${JSON.stringify(humanUsername)}, ${JSON.stringify(botUsername)})`
        );
    });
}


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
    //    if (process.platform !== 'darwin') app.quit();
    app.quit();
});
