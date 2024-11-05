const { BrowserWindow } = require('electron').remote;

document.getElementById('automationButton').addEventListener('click', () => {
  const discordWin = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load Discord login URL
  discordWin.loadURL('https://discord.com/channels/@me');

  // Automate interactions after page is ready
  discordWin.webContents.once('dom-ready', () => {
discordWin.webContents.executeJavaScript(`
  // Assume botUsername is the name of the bot you want to message
  const botUsername = 'BotName';
  const messageToSend = 'Hello, bot!';

  // Find the DM thread with the bot
  const botThread = document.querySelector(\`[aria-label="\${botUsername}"]\`);
  if (botThread) {
    botThread.click(); // Open the DM with the bot
    setTimeout(() => {
      // Type and send a message
      const messageBox = document.querySelector('[aria-label="Message #general"]');
      messageBox.value = messageToSend;
      messageBox.dispatchEvent(new Event('input', { bubbles: true }));

      // Send the message (using Enter key)
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      messageBox.dispatchEvent(enterEvent);
    }, 1000);

    setInterval(() => {
  const messages = Array.from(document.querySelectorAll('[class*="message-"]'));
  const lastMessage = messages[messages.length - 1]?.innerText;
  console.log("Bot's reply:", lastMessage);
}, 2000);

  }
`);

  });
});

