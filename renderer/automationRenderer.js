// renderer/automationRenderer.js
// --------------------------------
// Constants

const AVRAE_USERNAME = 'Avrae';
const ACCUMULATION_TIMEOUT = 2000;
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


// Use window.electronAPI for IPC communication
const ipcRenderer = window.electronAPI;

console.log("[RENDERER] --------------- Automation script running in renderer process -----------------");
console.log('[RENDERER] Initialized with config:', {
    MESSAGE_BOX_SELECTOR,
    AVRAE_USERNAME,
    ACCUMULATION_TIMEOUT
});

let currentMessage = {
    id: null,
    text: null,
    botUsername: null,
    humanUsername: null,
    options: null,
    state: null,
    startTime: null,
};

/**
 * Sends a message using DataTransfer (without using clipboard)
 * @param {Object} message - Message object containing text and metadata
 * @returns {Promise<void>}
 */
async function sendMessage(message) {
    console.log('[RENDERER] Looking for message box with selector:', MESSAGE_BOX_SELECTOR);
    const messageBox = document.querySelector(MESSAGE_BOX_SELECTOR);
    
    if (!messageBox) {
        console.error('[RENDERER] Message box not found. Available elements:', 
            Array.from(document.querySelectorAll('*'))
                .filter(el => el.getAttribute('role') === 'textbox')
                .map(el => ({
                    role: el.getAttribute('role'),
                    ariaLabel: el.getAttribute('aria-label'),
                    className: el.className
                }))
        );
        
        ipcRenderer.sendResponseToMain(message.id, {
            status: 'error',
            message: 'Message box not found',
            error: {
                type: 'ELEMENT_NOT_FOUND',
                selector: MESSAGE_BOX_SELECTOR
            }
        });
        return;
    }

        try {
            console.log('[RENDERER] Found message box:', messageBox);
            
            // Ensure the message box is focused
            messageBox.focus();
            await new Promise(resolve => setTimeout(resolve, 100));

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
            await new Promise(resolve => setTimeout(resolve, 100));

            // Dispatch an input event to ensure Discord processes the input
            messageBox.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 100));

        // Press Enter to send the message
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        messageBox.dispatchEvent(enterEvent);

        console.log("[RENDERER] Sent message:", message.text);
    } catch (error) {
        console.error('[RENDERER] Error sending message:', error);
        ipcRenderer.sendResponseToMain(message.id, {
            status: 'error',
            message: `Error sending message: ${error.message}`,
            error: {
                type: 'SEND_ERROR',
                details: error.message,
                stack: error.stack
            }
        });
    }
}

// Initialize message handler
ipcRenderer.receiveMessageFromMain(async (messageData) => {
    const { messageId, messageText, botUsername, humanUsername, options } = messageData;

    console.log('[RENDERER] Received message to send:', {
        messageId,
        text: messageText,
        botUsername, 
        humanUsername, 
        options
    });

    // Update current message state
    currentMessage = {
        id: messageId,
        text: messageText,
        botUsername,
        humanUsername,
        options,
        state: 'sending',
        startTime: Date.now(),
    };

    // Send the message and notify main process
    await sendMessage(currentMessage);
    ipcRenderer.sendResponseToMain(messageId, { status: 'message_typed' });
});
