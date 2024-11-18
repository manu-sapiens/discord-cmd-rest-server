// windowManager.js
let mainWindow = null;

function getMainWindow() {
    return mainWindow;
}

function setMainWindow(win) {
    mainWindow = win;
}

module.exports = {
    getMainWindow,
    setMainWindow
};
