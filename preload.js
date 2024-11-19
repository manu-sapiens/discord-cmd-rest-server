// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    receiveMessageFromMain: (callback) => {
        ipcRenderer.on('send-message-to-renderer', (event, messageData) => {
            callback(messageData);
        });
    },
    sendResponseToMain: (messageId, response) => {
        ipcRenderer.send('message-response', { messageId, response });
    }
});
