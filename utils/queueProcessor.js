// utils/queueProcessor.js
// --------------------------------
const { ipcMain } = require('electron');
const { getMainWindow } = require('../state');
// --------------------------------

const POST_RESOLVE_TIMEOUT = 60000; // 60 seconds

let messageQueue = [];
let isProcessingQueue = false;
const pendingMessages = new Map();

function enqueueMessage(messageText, botUsername, humanUsername, options = { expectBotResponse: true, expectEcho: false }) {
  console.log("Enqueueing message:", { messageText, botUsername, humanUsername, options });

  return new Promise((resolve, reject) => {
    const messageId = Date.now() + Math.random();
    messageQueue.push({ messageId, messageText, botUsername, humanUsername, options, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  const win = getMainWindow();
  if (isProcessingQueue || messageQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  const { messageId, messageText, botUsername, humanUsername, options, resolve, reject } = messageQueue.shift();
  pendingMessages.set(messageId, { resolve, reject });

  console.log(`Sending message to renderer: ${messageText}`);
  win.webContents.send('send-message-to-renderer', { messageId, messageText, botUsername, humanUsername, options });

  setTimeout(() => {
    if (pendingMessages.has(messageId)) {
      pendingMessages.get(messageId).reject('Timeout waiting for bot response');
      pendingMessages.delete(messageId);
      isProcessingQueue = false;
      processQueue();
    }
  }, POST_RESOLVE_TIMEOUT);
}

function initializeQueueProcessor() {
  ipcMain.on('message-response', (event, { messageId, response }) => {
    console.log(`Received response for messageId ${messageId}: ${response}`);
    if (pendingMessages.has(messageId)) {
      const { resolve } = pendingMessages.get(messageId);
      resolve(response);
      pendingMessages.delete(messageId);
    }
    isProcessingQueue = false;
    processQueue();
  });
}

module.exports = { enqueueMessage, initializeQueueProcessor };
