const { BrowserWindow } = require('electron');
const path = require('path');
const { getMainWindow } = require('./windowManager');

let mapWindow = null;
let galleryWindow = null;

function createMapWindow() {
    if (mapWindow) {
        return mapWindow;
    }

    // Get the main window's position and size
    const mainWindow = getMainWindow();
    const mainBounds = mainWindow.getBounds();

    // Create map window to the right of main window
    mapWindow = new BrowserWindow({
        width: 400,
        height: mainBounds.height,
        x: mainBounds.x + mainBounds.width,
        y: mainBounds.y,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        title: 'Map View'
    });

    // Load the map viewer HTML
    mapWindow.loadFile(path.join(__dirname, '../renderer/mapViewer.html'));

    // Show window when ready
    mapWindow.once('ready-to-show', () => {
        mapWindow.show();
    });

    // Handle window close
    mapWindow.on('closed', () => {
        mapWindow = null;
    });

    return mapWindow;
}

function createGalleryWindow() {
    if (galleryWindow) {
        return galleryWindow;
    }

    // Get the main window's position and size
    const mainWindow = getMainWindow();
    const mainBounds = mainWindow.getBounds();
    const mapBounds = mapWindow ? mapWindow.getBounds() : null;

    // Create gallery window to the right of map window (or main window if no map window)
    galleryWindow = new BrowserWindow({
        width: 400,
        height: mainBounds.height,
        x: mapBounds ? mapBounds.x + mapBounds.width : mainBounds.x + mainBounds.width,
        y: mainBounds.y,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        title: 'Image Gallery'
    });

    // Load the gallery viewer HTML
    galleryWindow.loadFile(path.join(__dirname, '../renderer/galleryViewer.html'));

    // Show window when ready
    galleryWindow.once('ready-to-show', () => {
        galleryWindow.show();
    });

    // Handle window close
    galleryWindow.on('closed', () => {
        galleryWindow = null;
    });

    return galleryWindow;
}

function updateMap(url) {
    const window = createMapWindow();
    if (window) {
        window.webContents.send('update-map', url);
    }
}

function updateOtherImage(url, metadata = {}) {
    const window = createGalleryWindow();
    if (window) {
        window.webContents.send('update-gallery', {
            url,
            ...metadata,
            timestamp: new Date().toISOString()
        });
    }
}

function clearGallery() {
    const window = galleryWindow;
    if (window) {
        window.webContents.send('clear-gallery');
    }
}

module.exports = {
    createMapWindow,
    createGalleryWindow,
    updateMap,
    updateOtherImage,
    clearGallery
};
