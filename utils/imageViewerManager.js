const { BrowserWindow } = require('electron');
const path = require('path');
const { getMainWindow } = require('./windowManager');

let imageViewerWindow = null;

function createImageViewerWindow() {
    if (imageViewerWindow) {
        return imageViewerWindow;
    }

    // Get the main window's position and size
    const mainWindow = getMainWindow();
    const mainBounds = mainWindow.getBounds();

    // Create a new window positioned to the right of the main window
    imageViewerWindow = new BrowserWindow({
        width: 400,
        height: mainBounds.height,
        x: mainBounds.x + mainBounds.width,
        y: mainBounds.y,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false
    });

    // Load the image viewer HTML
    imageViewerWindow.loadFile(path.join(__dirname, '../renderer/imageViewer.html'));

    // Show window when ready
    imageViewerWindow.once('ready-to-show', () => {
        imageViewerWindow.show();
    });

    // Handle window close
    imageViewerWindow.on('closed', () => {
        imageViewerWindow = null;
    });

    return imageViewerWindow;
}

function getImageViewerWindow() {
    return imageViewerWindow;
}

function updateMap(url) {
    const window = createImageViewerWindow();
    if (window) {
        window.webContents.send('update-map', url);
    }
}

function updateOtherImage(url) {
    const window = createImageViewerWindow();
    if (window) {
        window.webContents.send('update-other-image', url);
    }
}

module.exports = {
    createImageViewerWindow,
    getImageViewerWindow,
    updateMap,
    updateOtherImage
};
