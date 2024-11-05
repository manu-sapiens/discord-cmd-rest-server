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
            console.error('Message container not found');
            setTimeout(initialize, 1000);
            return;
        }

        // Mark existing messages as processed
        const existingMessages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
        existingMessages.forEach((message) => {
            const msgId = message.getAttribute('id');
            processedMessages.add(msgId);
        });

        console.log('Initialized processed messages with existing messages.');
    }
    initialize();

    // Listen for messages from main process via IPC
    ipcRenderer.receiveMessageFromMain((messageData) => {
        const { messageId, messageText, botUsername, humanUsername } = messageData;
        console.log('Received message to send:', messageText);

        if (currentMessage) {
            console.error('A message is already being processed.');
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
            console.error('Message box not found');
            ipcRenderer.sendResponseToMain(message.id, 'Message box not found');
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
                ipcRenderer.sendResponseToMain(currentMessage.id, 'Timeout waiting for bot response');
                currentMessage = null;
                return;
            }

            const messages = document.querySelectorAll(MESSAGE_ITEM_SELECTOR);
            messages.forEach((message) => {
                const msgId = message.getAttribute('id');
                if (processedMessages.has(msgId)) return;
                processedMessages.add(msgId);

                const senderElement = message.querySelector(MESSAGE_USERNAME_CLASS);
                const sender = senderElement ? senderElement.innerText : 'Unknown';
                const contentElement = message.querySelector(MESSAGE_CONTENT_CLASS);
                const content = contentElement ? contentElement.innerText : '';

                if (currentMessage.state === 'waiting_for_echo') {
                    if (sender === currentMessage.humanUsername && content === currentMessage.text) {
                        // User's message echoed back
                        console.log('User message confirmed sent.');
                        currentMessage.state = 'waiting_for_bot_response';
                    } else {
                        // Ignore and mark as read
                        console.log('Ignoring message while waiting for echo:', content);
                    }
                } else if (currentMessage.state === 'waiting_for_bot_response') {
                    if (sender === currentMessage.botUsername) {
                        // Bot's response received
                        console.log('Bot response received:', content);

                        // Send response back to main process
                        ipcRenderer.sendResponseToMain(currentMessage.id, content);
                        currentMessage = null;
                    } else {
                        // Ignore and mark as read
                        console.log('Ignoring message while waiting for bot response:', content);
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
