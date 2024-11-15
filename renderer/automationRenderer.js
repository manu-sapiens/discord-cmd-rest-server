// renderer/automationRenderer.js
// --------------------------------

(function () {
    console.log("[RENDERER] --------------- Automation script running in renderer process -----------------");

    // Use window.electronAPI for IPC communication
    const ipcRenderer = window.electronAPI;

    let currentMessage = null;

    // Listen for messages from main process via IPC
    ipcRenderer.receiveMessageFromMain((messageData) => {
        const { messageId, messageText, botUsername, humanUsername } = messageData;
        console.log('[RENDERER] Received message to send:', messageText);

        if (currentMessage) {
            console.error('[RENDERER] A message is already being processed.');
            ipcRenderer.sendResponseToMain(messageId, '[RENDERER]Another message is currently being processed.');
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
        if (RENDERED_DO_LESS==false) monitorMessages();
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
            console.log("[RENDERER]Sent {",message.text,"} to the message box");
        } else {
            console.error('[RENDERER] Message box not found');
            ipcRenderer.sendResponseToMain(message.id, 'Message box not found');
            currentMessage = null;
        }
    }

})();
