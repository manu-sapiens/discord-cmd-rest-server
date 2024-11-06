// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    receiveMessageFromMain: (callback) => {
        ipcRenderer.on('send-message-to-renderer', (event, messageData) => {
            callback(messageData);
        });
    },
    sendResponseToMain: (messageId, response) => {
        ipcRenderer.send('message-response', { messageId, response });
    },
});

// Listen for 'start-automation' message from the main process
ipcRenderer.on('start-automation', () => {
    if (window.automationStarted) {
        console.log("Automation already started.");
        return;
    }
    window.automationStarted = true;
    automationScript(); // Start the automation script
});

function automationScript() {
    console.log("Automation script running in preload script...");

    // Use ipcRenderer for IPC communication
    const ipc = ipcRenderer;

    // Define selectors and variables
    const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
    const MESSAGE_ITEM_SELECTOR = 'li[id^="chat-messages"]';
    const MESSAGE_CONTENT_SELECTOR = 'div[class*="markup"]';
    const EMBED_SELECTOR = 'article[class*="embedWrapper"]';
    const EMBED_AUTHOR_NAME_SELECTOR = 'span[class*="embedAuthorName"]'
    const EMBED_DESCRIPTION_SELECTOR = 'div[class*="embedDescription"]';
    const EMBED_FIELDS_CONTAINER_SELECTOR = 'div[class*="embedFields"]';
    const EMBED_FIELD_SELECTOR = ':scope > div[class*="embedField"]';
    const EMBED_FIELD_NAME_SELECTOR = 'div[class*="embedFieldName"]';
    const EMBED_FIELD_VALUE_SELECTOR = 'div[class*="embedFieldValue"]';
    const MESSAGE_USERNAME_SELECTOR = 'h3[class^="header"] span[class^="username"]';
    const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
    const CHECK_INTERVAL = 1000; // Check every second
    const processedMessages = new Set();

    let currentMessage = null;
    let messageContainer;

    // Initialize message container and processed messages
    function initialize() {
        messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
        if (!messageContainer) {
            console.error('Message container not found. Retrying in 1 second...');
            setTimeout(initialize, 1000);
            return;
        }

        // Mark existing messages as processed
        const existingMessages = messageContainer.querySelectorAll(MESSAGE_ITEM_SELECTOR);
        existingMessages.forEach((message) => {
            const msgId = message.getAttribute('id') || message.getAttribute('data-list-item-id');
            processedMessages.add(msgId);
        });

        console.log('Initialized processed messages with existing messages.');
    }
    initialize();

    // Listen for messages from main process via IPC
    ipc.on('send-message-to-renderer', (event, messageData) => {
        const { messageId, messageText, botUsername, humanUsername } = messageData;
        console.log('Received message to send:', messageText);

        if (currentMessage) {
            console.error('A message is already being processed.');
            ipc.send('message-response', { messageId, response: 'Another message is currently being processed.' });
            return;
        }

        currentMessage = {
            id: messageId,
            text: messageText,
            botUsername,
            humanUsername,
            state: 'waiting_for_echo',
            startTime: Date.now(),
        };

        // Start processing the message
        sendMessage(currentMessage);
        monitorMessages();
    });

    // Function to send a message using DataTransfer (without using clipboard)
    async function sendMessage(message) {
        const messageBox = document.querySelector(MESSAGE_BOX_SELECTOR);
        if (messageBox) {
            // Ensure the message box is focused
            messageBox.focus();

            // Create a DataTransfer object with the message text
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', message.text);

            // Create a paste event with the DataTransfer object
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true,
            });

            // Dispatch the paste event to the message box
            messageBox.dispatchEvent(pasteEvent);

            // Dispatch an input event to ensure Discord processes the input
            messageBox.dispatchEvent(new Event('input', { bubbles: true }));

            // Press Enter to send the message
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
            });
            messageBox.dispatchEvent(enterEvent);

            console.log('Message sent:', message.text);
        } else {
            console.error('Message box not found');
            ipc.send('message-response', { messageId: message.id, response: 'Message box not found' });
            currentMessage = null;
        }
    }

    // Function to monitor messages
    function monitorMessages() {
        if (!currentMessage) return;

        const TIMEOUT = 60000; // 60 seconds timeout

        function checkMessages() {
            if (!currentMessage) return;

            if (Date.now() - currentMessage.startTime > TIMEOUT) {
                console.error('Timeout waiting for bot response');
                ipc.send('message-response', { messageId: currentMessage.id, response: 'Timeout waiting for bot response' });
                currentMessage = null;
                return;
            }

            const messages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
            console.log(`Found ${messages.length} messages in the chat.`);
            messages.forEach((message) => {
                const msgId = message.getAttribute('id') || message.getAttribute('data-list-item-id');
                if (processedMessages.has(msgId)) {
                    // Already processed this message
                    return;
                }
                processedMessages.add(msgId);

                console.log("MESSAGE ID = ", msgId);
                console.log("FULL MESSAGE = ", message);
                
                // Try to get the sender's username
                let senderElement = message.querySelector(MESSAGE_USERNAME_SELECTOR);
                let sender = senderElement ? senderElement.innerText : 'Unknown';

                console.log("SENDER = ", sender);

                // Get the message content
                let contentElement = message.querySelector(MESSAGE_CONTENT_SELECTOR);
                let content = contentElement ? contentElement.innerText.trim() : '';

                if (content) console.log("CONTENT = ", content);

                // If content is empty, check for embeds
                if (!content) {
                    // Try to extract content from embeds
                    const embed = message.querySelector(EMBED_SELECTOR);
                    if (embed) {
                        let embedContentArray = [];

                        // Get embed author name
                        const authorElement = embed.querySelector(EMBED_AUTHOR_NAME_SELECTOR);
                        if (authorElement) {
                            const authorName = authorElement.innerText.trim();
                            embedContentArray.push(authorName);
                        }

                        // Get embed description, if any
                        const descriptionElement = embed.querySelector(EMBED_DESCRIPTION_SELECTOR);
                        if (descriptionElement) {
                            const description = descriptionElement.innerText.trim();
                            embedContentArray.push(description);
                        }

                        // Get embed fields container
                        const fieldsContainer = embed.querySelector(EMBED_FIELDS_CONTAINER_SELECTOR);
                        if (fieldsContainer) {
                            const fieldElements = fieldsContainer.querySelectorAll(EMBED_FIELD_SELECTOR);
                            fieldElements.forEach(field => {
                                const fieldNameElement = field.querySelector(EMBED_FIELD_NAME_SELECTOR);
                                const fieldValueElement = field.querySelector(EMBED_FIELD_VALUE_SELECTOR);
                                let fieldName = fieldNameElement ? fieldNameElement.innerText.trim() : '';
                                let fieldValue = fieldValueElement ? fieldValueElement.innerText.trim() : '';

                                console.log('Processing field:');
                                console.log('Field Name:', fieldName);
                                console.log('Field Value:', fieldValue);

                                if (fieldName || fieldValue) {
                                    embedContentArray.push(`${fieldName}: ${fieldValue}`);
                                }
                            });
                        }


                        content = embedContentArray.join('\n');
                        console.log('Extracted content from embed:', content);
                    }
                    else
                    {
                        console.log("NO EMBEDS FOUND.");
                    }
                }

                console.log(`Processing message ID: ${msgId}`);
                console.log(`Sender: ${sender}`);
                console.log(`Content: ${content}`);

                if (currentMessage.state === 'waiting_for_echo') {
                    if ((sender === 'Unknown' || sender === currentMessage.humanUsername) && content === currentMessage.text) {
                        // User's message echoed back
                        console.log('User message confirmed sent.');
                        currentMessage.state = 'waiting_for_bot_response';
                    } else {
                        // Ignore and mark as read
                        console.log('[3] Ignoring message while waiting for echo:', content);
                    }
                } else if (currentMessage.state === 'waiting_for_bot_response') {
                    if (sender === currentMessage.botUsername) {
                        // Bot's response received
                        console.log('Bot response received:', content);

                        // Send response back to main process
                        ipc.send('message-response', { messageId: currentMessage.id, response: content });
                        currentMessage = null;
                    } else {
                        // Ignore and mark as read
                        console.log('[4] Ignoring message while waiting for bot response:', content);
                    }
                } else {
                    // Ignore messages
                    console.log('[5] Ignoring message in unknown state:', content);
                }
            });

            // Continue checking messages
            if (currentMessage) {
                setTimeout(checkMessages, CHECK_INTERVAL);
            }
        }

        checkMessages();
    }
}
