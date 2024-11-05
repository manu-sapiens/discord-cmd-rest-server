const { app, BrowserWindow, Menu } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      //webSecurity: false, // Disable web security
    },
  });

    // Set the User-Agent to mimic a standard browser
    win.webContents.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36"
    );
  

  // Load Discord login page directly
  win.loadURL('https://discord.com/login');


  // Open DevTools for debugging
  win.webContents.openDevTools();

 // Define menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'Automation',
      submenu: [
        {
          label: 'Start Automation Test',
          click: async () => {
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

  Menu.setApplicationMenu(menu); // Set the custom menu

}


const fs = require('fs');
const path = require('path');
const humanUsername = 'manu_mercs';  // Replace with the actual username

async function startAutomation(win) {
  // Load the JavaScript file contents
  const scriptPath = path.join(__dirname, 'automation.js');
  const automationScript = fs.readFileSync(scriptPath, 'utf8');

  // Execute the script in the browser context
  await win.webContents.executeJavaScript(`(${automationScript})(${JSON.stringify(humanUsername)})`);

}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
  else app.quit(); // For DEVELOPMENT 
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

