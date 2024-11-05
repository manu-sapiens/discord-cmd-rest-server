function automationScript(HUMAN_USERNAME) {
  const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
  const MESSAGE_ITEM_CLASS = '.messageListItem_d5deea';
  const MESSAGE_USERNAME_CLASS = '.username_f9f2ca';
  const MESSAGE_CONTENT_CLASS = '.markup_f8f345';
  const EMBED_WRAPPER_CLASS = '.embedWrapper_b558d0';
  const EMBED_FIELD_CLASS = '.embedFieldValue_b0068a';
  const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
  const BOT_USERNAME = 'AVRAE_NotebookDnD';
  const CHECK_INTERVAL = 2000;

  const processedMessages = {};
  const messageExpectations = [];

  function initializeProcessedMessages() {
    const messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
    if (!messageContainer) return;

    const existingMessages = messageContainer.querySelectorAll(MESSAGE_ITEM_CLASS);
    existingMessages.forEach((message) => {
      const messageId = message.getAttribute('id');
      if (messageId) {
        processedMessages[messageId] = true;
      }
    });
  }

  async function sendCommand(command, expectedResponseText) {
    const messageBox = document.querySelector(MESSAGE_BOX_SELECTOR);
    if (messageBox) {
      console.log(`Sending command: ${command}`);
      messageExpectations.push({
        command,
        expectedText: expectedResponseText,
        received: false,
      });

      await pasteMessage(messageBox, command);

      // Simulate Enter key press to send the message
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      });
      messageBox.dispatchEvent(enterEvent);

      console.log('Message sent');
    } else {
      console.error('Message box not found');
    }
  }

  async function pasteMessage(messageBox, message) {
    await navigator.clipboard.writeText(message);
    messageBox.focus();
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
      bubbles: true,
    });
    pasteEvent.clipboardData.setData('text/plain', message);
    messageBox.dispatchEvent(pasteEvent);
    messageBox.dispatchEvent(new Event('input', { bubbles: true }));
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

      let embedContent = '';
      if (!content && message.querySelector(EMBED_WRAPPER_CLASS)) {
        const embedFields = message.querySelectorAll(EMBED_FIELD_CLASS);
        embedFields.forEach((field) => {
          embedContent += field.innerText + '\n';
        });
      }

      const fullContent = content || embedContent;

      if (messageExpectations.length > 0) {
        const currentExpectation = messageExpectations[0];

        if (!currentExpectation.received && fullContent.includes(currentExpectation.expectedText)) {
          console.log(`Expected response for "${currentExpectation.command}" received:`, fullContent);
          currentExpectation.received = true;
          messageExpectations.shift();
          return;
        }
      }

      if (sender === HUMAN_USERNAME) {
        console.log("Human's message:", fullContent);
      } else if (sender === BOT_USERNAME) {
        console.log("Bot's reply:", fullContent);
      } else {
        console.log("Other message:", fullContent);
      }
    });
  }

  initializeProcessedMessages();
  setInterval(readNewMessages, CHECK_INTERVAL);

  // Send commands as part of automation
  //sendCommand("!game status", "Game status: active");
  //sendCommand("!player info", "Player info retrieved");
}
