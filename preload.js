// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboard', {
    writeText: (text) => {
        console.log("-------- Writing clipboard --------")
        console.log("Text: ", text);
        ipcRenderer.send('clipboard-write', text);
    },
    readText: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay to ensure clipboard updates
        console.log("-------- Reading clipboard --------");
        text = await ipcRenderer.invoke('clipboard-read');
        console.log("Text: ", text);
        return text
    }
});

// Send bot response to main process
contextBridge.exposeInMainWorld('electronAPI', {
    sendBotResponse: (response) => ipcRenderer.send('bot-response', response)
});

