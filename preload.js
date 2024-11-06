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
        console.log("[PRELOAD]Automation already started.");
        return;
    }
    window.automationStarted = true;
    automationScript(); // Start the automation script
});

function automationScript() {
    console.log("[PRELOAD]Automation script running in preload script...");

    // Use ipcRenderer for IPC communication
    const ipc = ipcRenderer;

    // Define selectors and variables
    const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
    const MESSAGE_ITEM_SELECTOR = 'li[id^="chat-messages"]';
    const MESSAGE_CONTENT_SELECTOR = 'div[class*="markup"]';
    const EMBED_SELECTOR = 'article[class*="embedWrapper"]';
    const EMBED_AUTHOR_NAME_SELECTOR = 'span[class*="embedAuthorName"]';
    const EMBED_TITLE_SELECTOR = 'div[class*="embedTitle"]';
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
            console.error('[PRELOAD]Message container not found. Retrying in 1 second...');
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
        const { messageId, messageText, botUsername, humanUsername, expecting_bot_response } = messageData;
        console.log('Received message to send:', messageText);

        if (currentMessage) {
            console.error('[PRELOAD]A message is already being processed.');
            ipc.send('message-response', { messageId, response: 'Another message is currently being processed.' });
            return;
        }

        currentMessage = {
            id: messageId,
            text: messageText,
            botUsername,
            humanUsername,
            expecting_bot_response,
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
            console.error('[PRELOAD]Message box not found');
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
                console.error('[PRELOAD]Timeout waiting for bot response');
                ipc.send('message-response', { messageId: currentMessage.id, response: 'Timeout waiting for bot response' });
                currentMessage = null;
                return;
            }

            const messages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
            console.log(`Found ${messages.length} messages in the chat.`);
            let last_known_author = "Unknown"
            messages.forEach((message) => {
                const msgId = message.getAttribute('id') || message.getAttribute('data-list-item-id');
                if (processedMessages.has(msgId)) {
                    // Already processed this message
                    return;
                }
                processedMessages.add(msgId);

                console.log("[PRELOAD]MESSAGE ID = ", msgId);
                console.log("[PRELOAD]FULL MESSAGE = ", message);
                console.log("[PRELOAD]EXPECTING BOT RESPONSE = ", currentMessage.expecting_bot_response);

                // Try to get the sender's username
                let senderElement = message.querySelector(MESSAGE_USERNAME_SELECTOR);
                let sender = senderElement ? senderElement.innerText : 'Unknown';
                if (sender === 'Unknown')
                {
                    sender = last_known_author;
                    console.log("[PRELOAD] Unknown sender. Using last known author: ", last_known_author);
                }
                else
                {
                    last_known_author = sender
                }

                // Get the message content
                let contentElement = message.querySelector(MESSAGE_CONTENT_SELECTOR);
                let content = contentElement ? contentElement.innerText.trim() : '';

                if (content) console.log("[PRELOAD]CONTENT = ", content);

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

                        // Get embed title
                        const titleElement = embed.querySelector(EMBED_TITLE_SELECTOR);
                        if (titleElement) {
                            const titleText = titleElement.innerText.trim();
                            embedContentArray.push(titleText);
                        }

                        // Get embed description
                        const descriptionElement = embed.querySelector(EMBED_DESCRIPTION_SELECTOR);
                        if (descriptionElement) {
                            const description = descriptionElement.innerText.trim();
                            embedContentArray.push(description);
                        }

                        // Get embed fields
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
                    } else {
                        console.log("[PRELOAD]NO EMBEDS FOUND.");
                    }
                }

                console.log(`Processing message ID: ${msgId}`);
                console.log(`Sender: ${sender}`);
                console.log(`Content: ${content}`);

                if (currentMessage.state === 'waiting_for_echo') {
                    trimmed_sender = sender.trim().toLowerCase();
                    trimmed_current_username = currentMessage.humanUsername.trim().toLowerCase();
                    trimmed_content = content.trim().toLowerCase();
                    trimmed_current_text = currentMessage.text.trim().toLowerCase();
                    console.log("[PRELOAD]TRIMMED SENDER = ", trimmed_sender);
                    console.log("[PRELOAD]TRIMMED CURRENT USERNAME = ", trimmed_current_username);
                    console.log("[PRELOAD]TRIMMED CONTENT = ", trimmed_content);
                    console.log("[PRELOAD]TRIMMED CURRENT TEXT = ", trimmed_current_text);
                    if ((trimmed_sender === 'unknown' || trimmed_sender === trimmed_current_username) && trimmed_content === trimmed_current_text) {
                        // User's message echoed back
                        console.log('User message confirmed sent.');

                        if (currentMessage.expecting_bot_response)
                        {
                            console.log('Expecting bot response. Moving to WAITING');
                            currentMessage.state = 'waiting_for_bot_response';
                        }
                        else
                        {
                            console.log('NOT expecting bot response. Returning null response.');
                            // We are done. Sending null response back to main process
                            ipc.send('message-response', { messageId: currentMessage.id, response: null });
                            currentMessage = null;
                        }
                    } else {
                        // Ignore and mark as read
                        console.log('[3] Ignoring message while waiting for echo. Got ', content, " but expected ", currentMessage.text);
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
