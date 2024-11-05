// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose clipboard functionality safely
contextBridge.exposeInMainWorld('clipboard', {
    writeText: (text) => ipcRenderer.send('clipboard-write', text),
    readText: () => ipcRenderer.invoke('clipboard-read')
});
