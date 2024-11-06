// renderer/automationRenderer.js

(function () {
    console.log("Automation script running in renderer process...");

    // Use window.electronAPI for IPC communication
    const ipcRenderer = window.electronAPI;

    // Define selectors and variables
    const MESSAGE_CONTAINER_SELECTOR = '[data-list-id="chat-messages"]';
    const MESSAGE_ITEM_SELECTOR = '[id^="chat-messages-"]';
    const MESSAGE_USERNAME_CLASS = '.headerText-3Uvj1Y';
    const MESSAGE_CONTENT_CLASS = '.markup-eYLPri';
    const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
    const CHECK_INTERVAL = 1000; // Check every second
    const processedMessages = new Set();

    let currentMessage = null;
    let messageContainer;

    // Initialize message container and processed messages
    function initialize() {
        messageContainer = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
        if (!messageContainer) {
            console.error('[RENDERER] Message container not found');
            setTimeout(initialize, 1000);
            return;
        }

        // Mark existing messages as processed
        const existingMessages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
        let last_known_author = "Unknown";
        existingMessages.forEach((message) => {
            const msgId = message.getAttribute('id');
            processedMessages.add(msgId);
            // display the message content:
            const senderElement = message.querySelector(MESSAGE_USERNAME_CLASS);
            let sender = senderElement ? senderElement.innerText : 'Unknown';
            if (sender === 'Unknown')
            {
                sender = last_known_author;
                console.log("[RENDERER] Unknown sender. Using last known author: ", last_known_author);
            }
            else
            {
                last_known_author = sender
            }

            const contentElement = message.querySelector(MESSAGE_CONTENT_CLASS);
            const content = contentElement ? contentElement.innerText : '';
            console.log('[RENDERER] Existing message:', { msgId, sender, content });
            
        });

        console.log('[RENDERER] Initialized processed messages with existing messages.');
    }
    initialize();

    // Listen for messages from main process via IPC
    ipcRenderer.receiveMessageFromMain((messageData) => {
        const { messageId, messageText, botUsername, humanUsername } = messageData;
        console.log('[RENDERER] Received message to send:', messageText);

        if (currentMessage) {
            console.error('[RENDERER] A message is already being processed.');
            ipcRenderer.sendResponseToMain(messageId, 'Another message is currently being processed.');
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
        } else {
            console.error('[RENDERER] Message box not found');
            ipcRenderer.sendResponseToMain(message.id, 'Message box not found');
            currentMessage = null;
        }
    }

    // Function to monitor messages
    function monitorMessages() {
        if (!currentMessage) return;

        const TIMEOUT = 60000; // 60 seconds timeout

        function checkMessages() {
            console.log("checking messages");
            if (!currentMessage) 
            {
                console.log("[RENDERER] no current message. returning");
                return;
            }

            if (Date.now() - currentMessage.startTime > TIMEOUT) 
            {
                console.error('[RENDERER] Timeout waiting for bot response');
                ipcRenderer.sendResponseToMain(currentMessage.id, 'Timeout waiting for bot response');
                currentMessage = null;
                return;
            }

            const messages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
            console.log("messages: ", messages);
            console.log("# of messages: ", messages.length);

            var counter = 0;
            messages.forEach((message) => 
            {
                    counter++;
                const msgId = message.getAttribute('id');
                const senderElement = message.querySelector(MESSAGE_USERNAME_CLASS);
                const sender = senderElement ? senderElement.innerText : 'Unknown';
                const contentElement = message.querySelector(MESSAGE_CONTENT_CLASS);
                const content = contentElement ? contentElement.innerText : '';

                console.log("Looking at: ", { msgId, sender, content });

                if (processedMessages.has(msgId)) 
                {
                    console.log('Already seen:', { counter, msgId, sender, content });
                    return;
                }
                processedMessages.add(msgId);

                current_username = currentMessage.humanUsername;
                current_text = currentMessage.text;
                console.log('[',counter,'] Current message:', { current_state, current_username, current_text });
                if (currentMessage.state === 'waiting_for_echo') {
                    console.log("waiting for echo of this: ", { current_username,  current_text });
                    if (sender === current_username && content ===current_text) {
                        // User's message echoed back
                        console.log('[RENDERER] User message confirmed sent.');
                        currentMessage.state = 'waiting_for_bot_response';
                    } else {
                        // Ignore and mark as read
                        console.log('[RENDERER][1] Ignoring message while waiting for echo:', {content, sender, msgId});
                    }
                } else if (currentMessage.state === 'waiting_for_bot_response') {
                    if (sender === currentMessage.botUsername) {
                        // Bot's response received
                        console.log('[RENDERER] Bot response received:', content);

                        // Send response back to main process
                        ipcRenderer.sendResponseToMain(currentMessage.id, content);
                        currentMessage = null;
                    } else {
                        // Ignore and mark as read
                        console.log('[RENDERER][2] Ignoring message while waiting for bot response:', content);
                    }
                } else {
                    // Ignore messages
                }
            });

            // Continue checking messages
            if (currentMessage) {
                setTimeout(checkMessages, CHECK_INTERVAL);
            }
        }

        checkMessages();
    }
})();
