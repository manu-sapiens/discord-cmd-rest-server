// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Listener for message directly sent from main process
    sendMessageToRenderer: function (callback) {
        ipcRenderer.on('send-message-to-renderer', function (event, message) {
            console.log("Received message from main process:", message);
            callback(message); // Pass the message to the provided callback
        });
    }
});

contextBridge.exposeInMainWorld('clipboard', {
    writeText: function (text) {
        console.log("-------- Writing to clipboard --------");
        console.log("Text: ", text);
        ipcRenderer.send('clipboard-write', text);
    },
    readText: function () {
        return new Promise(function (resolve) {
            // Small delay to ensure clipboard updates
            setTimeout(function () {
                console.log("-------- Reading from clipboard --------");
                ipcRenderer.invoke('clipboard-read').then(function (text) {
                    console.log("Clipboard Text:", text);
                    resolve(text);
                }).catch(function (error) {
                    console.error("Error reading from clipboard:", error);
                    resolve(""); // Resolve with empty string in case of error
                });
            }, 100); // 100 ms delay to ensure clipboard has been updated
        });
    }
});
