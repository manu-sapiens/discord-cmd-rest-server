// automation.js
module.exports = function automationScript(win, botUsername, humanUsername) 
{
  console.log("-------- automation script --------");

  return new Promise(function (resolve) {

      console.log("-------- executing automation script --------");
      // Complete automation code as previously discussed
      function automation(HUMAN_USERNAME, BOT_USERNAME) {

          console.log("Automation script running...");
          // Define all selectors, functions, and logic here
          const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
          const MESSAGE_ITEM_CLASS = '.messageListItem_d5deea';
          const MESSAGE_USERNAME_CLASS = '.username_f9f2ca';
          const MESSAGE_CONTENT_CLASS = '.markup_f8f345';
          const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
          const CHECK_INTERVAL = 2000;
          const processedMessages = {};
          let resolved = false;

          async function pasteMessage(messageBox) {
            messageBox.focus();
        
            // Use message from main process IPC instead of reading from the clipboard
            window.electronAPI.sendMessageToRenderer(async (message) => {
                console.log("Pasting message:", message); // Log the exact message to verify it's correct
        
                const pasteEvent = new ClipboardEvent('paste', {
                    clipboardData: new DataTransfer(),
                    bubbles: true,
                });
                pasteEvent.clipboardData.setData('text/plain', message);
                messageBox.dispatchEvent(pasteEvent);
                messageBox.dispatchEvent(new Event('input', { bubbles: true }));
        
                // Clear the clipboard as a final safeguard (optional)
                await window.clipboard.writeText("");
            });
          }

          async function sendCommand() {
              const messageBox = document.querySelector(MESSAGE_BOX_SELECTOR);
              if (messageBox) {
                  await pasteMessage(messageBox);

                  const enterEvent = new KeyboardEvent('keydown', {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      bubbles: true,
                  });
                  messageBox.dispatchEvent(enterEvent);
              } else {
                  console.error('Message box not found');
              }
          }

          function readNewMessages() {
              const messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
              if (!messageContainer) return;

              const messages = messageContainer.querySelectorAll(MESSAGE_ITEM_CLASS);
              messages.forEach((message) => {
                  const messageId = message.getAttribute('id');
                  if (processedMessages[messageId]) return;
                  processedMessages[messageId] = true;

                  const sender = message.querySelector(MESSAGE_USERNAME_CLASS)?.innerText || 'Unknown';
                  const contentElement = message.querySelector(MESSAGE_CONTENT_CLASS);
                  const content = contentElement ? contentElement.innerText : '';

                  if (sender === BOT_USERNAME && content && !resolved) {
                      console.log("Bot response found:", content);
                      resolve(content);
                      resolved = true;
                  }
              });
          }

          sendCommand();
          setInterval(readNewMessages, CHECK_INTERVAL);
      }

      win.webContents.executeJavaScript(
          `(${automation})(${JSON.stringify(humanUsername)}, ${JSON.stringify(botUsername)})`
      );
  });
};
