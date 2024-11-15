//main.js
// --------------------------------
const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const { app, BrowserWindow, Menu, dialog } = require('electron');
// --------------------------------
const roomRoute = require('./routes/places/room');
const modificationRoute = require('./routes/places/modifications');
const dungeonRoute = require('./routes/places/dungeon');
const messageRoute = require('./routes/discord/message');
const commandRoute = require('./routes/discord/command'); 
const healthRoute = require('./routes/health');
const { initializeQueueProcessor } = require('./utils/queueProcessor'); 
const { setAutomationStarted, getAutomationStarted, setMainWindow } = require('./state');
// --------------------------------

const PORT = process.env.DISCORD_AUTOMATION_SERVER_PORT || 3037;

let win;
const server = express();

server.use(bodyParser.json());

// Register routes
server.use('/places/rooms', roomRoute);
server.use('/places/modifications', modificationRoute);
server.use('/places/dungeon', dungeonRoute);
server.use('/health', healthRoute);
server.use('/discord/send-message', messageRoute);
server.use('/discord/send-command', commandRoute);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'assets', 'gen_ai.icns'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Load the preload script
            nodeIntegration: false, // Disable nodeIntegration for security
            contextIsolation: true, // Enable contextIsolation for security
            // Enable experimental features to allow DataTransfer in paste event
            experimentalFeatures: true,
        },
    });

    setMainWindow(win);
    // Initialize queue processor for handling message queue logic
    initializeQueueProcessor();

    // win.webContents.audioMuted = true;

    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
    );
    win.loadURL('https://discord.com/login');
    win.webContents.openDevTools();
}

// function startRestServer() {
//     console.log("----- Starting REST server -----");
//     const server = express();
//     server.use(express.json());

//     const messageQueue = [];
//     let isProcessingQueue = false;
//     const pendingMessages = new Map();

//     function enqueueMessage(win, messageText, botUsername, humanUsername, options = { expectBotResponse: true, expectEcho: false }) 
//     {
//         console.log("Enqueueing message:", { messageText, botUsername, humanUsername, options });

//         let p = new Promise((resolve, reject) => {
//             const messageId = Date.now() + Math.random(); // Unique ID for the message
//             messageQueue.push({ messageId, messageText, botUsername, humanUsername, options, resolve, reject });
//             processQueue(win);
//         });
//         return p
//     }    

//     function processQueue(win) {
//         if (isProcessingQueue || messageQueue.length === 0) {
//             return;
//         }

//         isProcessingQueue = true;

//         const { messageId, messageText, botUsername, humanUsername, options, resolve, reject } = messageQueue.shift();

//         // Store resolve and reject functions for later use
//         pendingMessages.set(messageId, { resolve, reject });


//         // Send message to renderer
//         console.log(`Sending message to renderer: ${messageText}`);
//         win.webContents.send('send-message-to-renderer', { messageId, messageText, botUsername, humanUsername, options});


//         // Timeout handling
//         setTimeout(() => {
//             if (pendingMessages.has(messageId)) {
//                 pendingMessages.get(messageId).reject('Timeout waiting for bot response');
//                 pendingMessages.delete(messageId);
//                 isProcessingQueue = false;
//                 processQueue(win); // Process next message in the queue
//             }
//         }, POST_RESOLVE_TIMEOUT); // 60 seconds timeout
//     }

//     // IPC handler for message responses from renderer
//     ipcMain.on('message-response', (event, { messageId, response }) => {
//         console.log(`Received response for messageId ${messageId}: ${response}`);
//         if (pendingMessages.has(messageId)) {
//             const { resolve } = pendingMessages.get(messageId);
//             resolve(response);
//             pendingMessages.delete(messageId);
//         }
//         isProcessingQueue = false;
//         processQueue(win); // Process next message in the queue
//     });

//     server.post('/send-message', async function (req, res) {
//         const { message, humanUsername } = req.body;
    
//         if (!automationStarted) {
//             return res.status(400).send("[send-message][400] Automation not started. Please start automation via the Menu.");
//         }

//         if (!message || !humanUsername) {
//             return res.status(400).send("[send-message][400] Message and humanUsername are required. We have received: " + JSON.stringify(req.body)+ " with message = ["+message+"] and humanUsername = ["+humanUsername+"]");
//         }
    
//         // Enqueue the message without expecting a bot response
//         try {
//             const response = await enqueueMessage(win, message, null, humanUsername, { expectBotResponse: false, expectEcho: true });
//             res.json({ response });
//         } catch (error) {
//             console.error("Error sending message:", error);
//             res.status(500).send("[send-message][500]Failed to send message: " + error);
//         }
//     });

//     server.post('/send-command', async function (req, res) {
//         const { message, botUsername, humanUsername, commandPrefix = '!' } = req.body;
    
//         if (!automationStarted) {
//             return res.status(400).send("[send-command][400] Automation not started. Please start automation via the Menu.");
//         }

//         if (!message || !botUsername || !humanUsername) {
//             return res.status(400).send("[send-command][400] Message, botUsername, and humanUsername are required.");
//         }
    
//         // Ensure the message starts with the command prefix
//         let commandMessage = message.startsWith(commandPrefix) ? message : commandPrefix + message;
    
//         // Enqueue the command and expect a bot response
//         try {
//             const response = await enqueueMessage(win, commandMessage, botUsername, humanUsername, { expectBotResponse: true, expectEcho: false  });
//             res.json({ response });
//         } catch (error) {
//             console.error("Error sending command:", error);
//             res.status(500).send("[send-command][500] Failed to send command: " + error);
//         }
//     });
    

//     server.listen(DISCORD_AUTOMATION_SERVER_PORT, function () {
//         console.log(`REST server listening on port ${DISCORD_AUTOMATION_SERVER_PORT}`);
//     });
// }

// App Initialization
app.whenReady().then(() => {
    createWindow();
    //startRestServer();

    // Create the menu after the window is ready
    const menu = Menu.buildFromTemplate([
        {
            label: 'Automation',
            submenu: [
                {
                    label: 'Start Automation',
                    click: function () {
                        if (getAutomationStarted()) {
                            dialog.showMessageBox({
                                type: 'info',
                                title: 'Automation Already Started',
                                message: 'Automation has already been started.',
                            });
                            console.log("Automation already started.");
                            return;
                        }

                        // Send message to renderer to start automation
                        console.log("Starting automation...");
                        win.webContents.send('start-automation');
                        setAutomationStarted(true);
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Automation Started',
                            message: 'Automation script started successfully.',
                        });
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
