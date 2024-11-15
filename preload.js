// preload.js
// --------------------------------
const { contextBridge, ipcRenderer } = require('electron');
// --------------------------------

// Define constants
const STATE_FIRST_WAIT_FOR_ECHO = 'waiting_for_echo';
const STATE_SECOND_WAIT_FOR_BOT_RESPONSE_AFTER_ECHO = 'waiting_for_bot_response';
const STATE_FIRST_WAIT_FOR_ACCUMULATION = 'accumulating_without_echo';

// Define selectors
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

// Define timeouts and intervals
const TIMEOUT_POST_RESPONSE = 20000; // 60 seconds timeout
const MESSAGE_CHECK_INTERVAL = 100; // Check every 1/10 second
const TIMEOUT_ACCUMULATION = 2000; // 2 seconds timeout for accumulating without echo

// Function to log messages to the console, takes the same arguments as console.log including things like "this", var, "then", other var
function console_log(message, ...optionalParams)
{
    console.log("[PRELOAD] ",message, ...optionalParams);
}
console_log("Preload script loaded. TIMEOUT_POST_RESPONSE=",TIMEOUT_POST_RESPONSE," | MESSAGE_CHECK_INTERVAL=",MESSAGE_CHECK_INTERVAL," | TIMEOUT_POST_RESPONSE=",TIMEOUT_POST_RESPONSE);
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
        console.log("[PRELOAD] Automation already started.");
        return;
    }
    window.automationStarted = true;
    automationScript(); // Start the automation script
});

function automationScript() 
{
    console.log("[PRELOAD] Automation script running in preload script...");

    // Use ipcRenderer for IPC communication
    const ipc = ipcRenderer;
    const processedMessages = new Set();

    let currentMessage = null;
    let messageContainer;
    let accumulatedResponses = [];
    let last_known_author = "Unknown";
    // let received_real_answer = false;

    // Initialize message container and processed messages
    function initialize() {
        messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
        if (!messageContainer) {
            console.error('[PRELOAD] Message container not found. Retrying in 1 second...');
            setTimeout(initialize, 1000);
            return;
        }

        // Mark existing messages as processed
        const existingMessages = messageContainer.querySelectorAll(MESSAGE_ITEM_SELECTOR);
        existingMessages.forEach((message) => {
            const msgId = message.getAttribute('id') || message.getAttribute('data-list-item-id');

            // Try to get the sender's username
            let senderElement = message.querySelector(MESSAGE_USERNAME_SELECTOR);
            let sender = senderElement ? senderElement.innerText : 'Unknown';
            if (sender === 'Unknown')
            {
                sender = last_known_author;
                //console.log("[PRELOAD] Unknown sender. Using last known author: ", last_known_author);
            }
            else
            {
                last_known_author = sender;
            }


            processedMessages.add(msgId);
        });

        console.log('PRELOAD] Initialized processed messages with existing messages.');
    }
    initialize();

    // Listen for messages from main process via IPC
    ipc.on('send-message-to-renderer', (event, messageData) => {
        const { messageId, messageText, botUsername, humanUsername, options} = messageData;
        console.log('[PRELOAD] Received message to send:', messageText);
        console.log('[PRELOAD] Bot username:', botUsername);
        console.log('[PRELOAD] Human username:', humanUsername);
        console.log('[PRELOAD] Options:', options);
        console.log('[PRELOAD] options.expectBotResponse = ', options.expectBotResponse);
        console.log('[PRELOAD] options.expectEcho = ', options.expectEcho);


        if (currentMessage) {
            console.error('[PRELOAD] A message is already being processed.');
            const contents = [];
            const error = 'Another message is currently being processed.';
            const response = {contents, error};         
            ipc.send('message-response', { messageId, response});
            return;
        }

        const expecting_bot_response = options && options.expectBotResponse && options.expectBotResponse === true;
        const expecting_echo = options && options.expectEcho && options.expectEcho === true;
        const state = expecting_echo ? STATE_FIRST_WAIT_FOR_ECHO : STATE_FIRST_WAIT_FOR_ACCUMULATION;
        console.log(`[PRELOAD] Expecting bot response: ${expecting_bot_response}`);
        console.log(`[PRELOAD] Expecting echo: ${expecting_echo}`);
        
        currentMessage = {
            id: messageId,
            text: messageText,
            botUsername,
            humanUsername,
            expecting_bot_response,
            expecting_echo,
            state,
            startTime: Date.now(),
        };

        accumulatedResponses = []; // Reset accumulated responses for new message

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
            const error = 'Message box not found';
            const contents = [];
            const response = {contents, error};
            const messageId = message.id;
            ipc.send('message-response', { messageId, response});
            currentMessage = null;
        }
    }

    // Function to monitor messages
    function monitorMessages() {
        if (!currentMessage) return;
        checkMessages();

        function checkMessages() {
            if (!currentMessage) return;

            const elapsedTime = Date.now() - currentMessage.startTime;
            // console.log(`[PRELOAD] Checking messages for ${elapsedTime} ms...`);

            if (currentMessage && currentMessage.state === STATE_FIRST_WAIT_FOR_ACCUMULATION) 
            {
                // accumulation timeout only start after receiving at least 1 real answer
                //if (received_real_answer && elapsedTime >= TIMEOUT_ACCUMULATION) 
                if (accumulatedResponses.length > 0 && elapsedTime >= TIMEOUT_ACCUMULATION)
                {
                    const contents = accumulatedResponses;
                    const error = null;
                    const response = {contents, error};
                    const messageId = currentMessage.id;
                    ipc.send('message-response', { messageId, response });
                    console.log('[PRELOAD]Timeout reached, accumulated responses sent to POST Reply:', accumulatedResponses);
                    accumulatedResponses = [];
                    currentMessage = null;
                }

            }

            if (elapsedTime > TIMEOUT_POST_RESPONSE) 
            {
                console.error('[PRELOAD]Timeout waiting for bot response');
                //ipc.send('message-response', { messageId: currentMessage.id, response: 'Timeout waiting for bot response' });
                //currentMessage = null;
                return;
            }

            const messages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
            console.log(`Found ${messages.length} messages in the chat.`);
            //let last_known_author = "Unknown";
            messages.forEach((message) => {
                const msgId = message.getAttribute('id') || message.getAttribute('data-list-item-id');

                if (processedMessages.has(msgId)) 
                {
                    return;
                }

                processedMessages.add(msgId);

                // Try to get the sender's username
                let senderElement = message.querySelector(MESSAGE_USERNAME_SELECTOR);
                let sender = senderElement ? senderElement.innerText : 'Unknown';
                if (sender !== 'Unknown')
                {
                    if  (sender !== last_known_author)
                    {
                        // console.log("[PRELOAD] Known sender. Updating last known author: From: ", last_known_author, " To: ", sender);
                        last_known_author = sender
                    }
                }
                else
                {
                    sender = last_known_author;
                    // console.log("[PRELOAD] Unknown sender. Using last known author: ", last_known_author);
                }

                // console.log("[PRELOAD]MESSAGE ID = ", msgId);
                // console.log("[PRELOAD]FULL MESSAGE = ", message);
                // console.log("[PRELOAD]EXPECTING BOT RESPONSE = ", currentMessage.expecting_bot_response);

                // Get the message content
                let contentElement = message.querySelector(MESSAGE_CONTENT_SELECTOR);
                const text = contentElement ? contentElement.innerText.trim() : '';
                let embed = message.querySelector(EMBED_SELECTOR);

                if (embed) 
                {
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

                            if (fieldName || fieldValue) {
                                embedContentArray.push(`${fieldName}: ${fieldValue}`);
                            }
                        });
                    }

                    embed = embedContentArray.join('\n');
                }
            
                const content = { text, embed, sender };
                const trimmed_sender = sender.trim().toLowerCase();
                const trimmed_expected_humanUsername = currentMessage.humanUsername.trim().toLowerCase();
                // for content, we need to trim out all non-alphanumeric characters and convert to lowercase
                const trimmed_text = text.replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();
                const trimmed_expected_text = currentMessage.text.replace(/[^a-zA-Z0-9]/g, '').trim().toLowerCase();

                switch (currentMessage.state) {
                    case STATE_FIRST_WAIT_FOR_ECHO:
                    {
                        if (trimmed_sender !== trimmed_expected_humanUsername)
                        {
                            console.log('Sender {',trimmed_sender,'} does not match expected human username {,',trimmed_expected_humanUsername,'}');
                            console.log('We also go: Content Received {',trimmed_text,'} vs Expected {',trimmed_expected_text,'}')
                            break;
                        }

                        if (trimmed_text !== trimmed_expected_text)
                        {
                            console.log('Content {',trimmed_text,'} does not match expected content {',trimmed_expected_text,'}');
                            console.log('We also go: Sender Received {',trimmed_sender,'} vs Expected {,',trimmed_expected_humanUsername,'}')

                            break;
                        }

                        console.log('User message confirmed sent.');
                        if (currentMessage.expecting_bot_response) 
                        {
                            console.log('Now expecting bot response after echo.');
                            currentMessage.state = STATE_SECOND_WAIT_FOR_BOT_RESPONSE_AFTER_ECHO;

                            break;
                        }

                        console.log('Not expecting bot response after echo. EMPTY POST Reply sent.');
                        const error = null;
                        const contents = [];
                        const response = {contents, error};
                        const messageId = currentMessage.id;
                        ipc.send('message-response', { messageId, response});
                        currentMessage = null;
                        break;
                    }

                    case STATE_SECOND_WAIT_FOR_BOT_RESPONSE_AFTER_ECHO:
                    {
                        if (sender === currentMessage.botUsername) 
                        {
                            console.log('Bot response received:', content);
                            console.log('Sending POST response back to main process.');
                            const contents = [content];
                            const error = null;
                            const response = {contents, error};
                            const messageId = currentMessage.id;
                            ipc.send('message-response', { messageId, response });
                            currentMessage = null;
                        } 
                        else 
                        {
                            // Ignore and mark as read
                            console.log('[4] Ignoring message while waiting for bot response:', text, embed, sender);
                        }
                        break;
                    } 
                    case STATE_FIRST_WAIT_FOR_ACCUMULATION:
                    {
                        // console.log('Accumulating bot response:', content);
                        // accumulatedResponses.push(content);
                        // console.log('Accumulated responses size:', accumulatedResponses.length);   
                        
                        // if (received_real_answer == false)
                        // {
                        //     if (trimmed_sender !== trimmed_expected_humanUsername) received_real_answer = true;
                        //     else if (trimmed_text !== trimmed_expected_text) received_real_answer = true;
                        // }

                        if (embed != null || trimmed_sender !== trimmed_expected_humanUsername || trimmed_text !== trimmed_expected_text) 
                        {
                            console.log('Accumulating bot response:', content);
                            accumulatedResponses.push(content);
                            console.log('Accumulated responses size:', accumulatedResponses.length);   
                        }

                        break;
                    }

                    default:
                    {
                        // Ignore messages
                        console.error('[PRELOAD] Unknown state:', currentMessage.state);
                        console.log('[PRELOAD] Ignoring message:', text, embed);
                    }
                }                       
            });

            // wait CHECK_INTERVAL for next check
            if (currentMessage) setTimeout(checkMessages, MESSAGE_CHECK_INTERVAL);
        }
    }
}
       
