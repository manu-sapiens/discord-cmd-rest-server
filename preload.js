// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose clipboard functionality safely
contextBridge.exposeInMainWorld('clipboard', {
    writeText: (text) => {
        console.log("-------- Writing clipboard --------")
        console.log("Text: ", text);
        ipcRenderer.send('clipboard-write', text);
    },
    readText: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay to ensure clipboard updates
        console.log("-------- Reading clipboard --------");
        text = ipcRenderer.invoke('clipboard-read');
        console.log("Text: ", text);
        return text;
    }
});
