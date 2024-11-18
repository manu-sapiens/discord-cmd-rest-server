// renderer/automationRenderer.js
// --------------------------------

(function () {
    console.log("[RENDERER] --------------- Automation script running in renderer process -----------------");

    // Use window.electronAPI for IPC communication
    const ipcRenderer = window.electronAPI;

    // Discord selectors
    const MESSAGE_BOX_SELECTOR = 'div[role="textbox"][contenteditable="true"]';
    const MESSAGE_AUTHOR_SELECTOR = '[class*="username_"]';  // Updated selector
    const AVRAE_USERNAME = ipcRenderer.getAvraeUsername();  // Get from IPC bridge
    const ACCUMULATION_TIMEOUT = 2000; // 2 seconds to accumulate responses

    let currentMessage = null;
    let accumulatedResponses = [];
    let accumulationTimer = null;

    // Listen for messages from main process via IPC
    ipcRenderer.receiveMessageFromMain((messageData) => {
        const { messageId, messageText, botUsername, humanUsername, options } = messageData;
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
            options,
            state: 'waiting_for_echo',
            startTime: Date.now(),
        };

        // Start processing the message
        sendMessage(currentMessage);
        monitorMessages();
    });

    // Monitor for message confirmation and bot responses
    function monitorMessages() {
        // Get all messages in the chat
        const messages = document.querySelectorAll('[class*="message__"]');
        console.log('[RENDERER] Found', messages.length, 'messages');

        // Look at last few messages instead of just the last one
        const lastMessages = Array.from(messages).slice(-3);
        
        if (currentMessage) {
            console.log('[RENDERER] Current message state:', {
                text: currentMessage.text,
                state: currentMessage.state,
                startTime: new Date(currentMessage.startTime).toISOString(),
                elapsed: Date.now() - currentMessage.startTime
            });

            lastMessages.forEach((message, index) => {
                const messageContent = message.textContent;
                const authorElement = message.querySelector(MESSAGE_AUTHOR_SELECTOR);
                const author = authorElement ? authorElement.textContent.trim() : '';
                
                console.log(`[RENDERER] Message [${index}]:`, {
                    author,
                    content: messageContent,
                    authorElement: authorElement ? {
                        className: authorElement.className,
                        parentClassName: authorElement.parentElement?.className,
                        html: authorElement.outerHTML
                    } : 'not found',
                    isAvraeMessage: author.includes(AVRAE_USERNAME)
                });

                // First wait for our message to be sent
                if (currentMessage.state === 'waiting_for_echo') {
                    if (messageContent.includes(currentMessage.text)) {
                        console.log('[RENDERER] Found our message in chat');
                        currentMessage.state = 'waiting_for_bot';
                        // Reset accumulated responses
                        accumulatedResponses = [];
                    }
                }
                // Then collect AVRAE responses
                else if (currentMessage.state === 'waiting_for_bot') {
                    if (author.includes(AVRAE_USERNAME)) {
                        console.log('[RENDERER] Found AVRAE response:', messageContent);
                        
                        accumulatedResponses.push({
                            text: messageContent,
                            sender: author
                        });

                        // If we have a responseMatch and it matches, send immediately
                        if (currentMessage.options.responseMatch && 
                            messageContent.toLowerCase().includes(currentMessage.options.responseMatch.toLowerCase())) {
                            console.log('[RENDERER] Found matching response');
                            ipcRenderer.sendResponseToMain(currentMessage.id, {
                                status: 'success',
                                message: 'Found matching response',
                                contents: accumulatedResponses
                            });
                            currentMessage = null;
                            return;
                        }
                        
                        // Otherwise, start/reset accumulation timer
                        if (accumulationTimer) {
                            clearTimeout(accumulationTimer);
                        }
                        accumulationTimer = setTimeout(() => {
                            console.log('[RENDERER] Accumulation timeout reached, sending responses:', accumulatedResponses);
                            ipcRenderer.sendResponseToMain(currentMessage.id, {
                                status: 'success',
                                message: 'Received bot responses',
                                contents: accumulatedResponses
                            });
                            currentMessage = null;
                        }, ACCUMULATION_TIMEOUT);
                    }
                }
            });
        }

        // Check timeout
        if (currentMessage && Date.now() - currentMessage.startTime > (currentMessage.options.timeout || 5000)) {
            console.error('[RENDERER] Message timeout after', Date.now() - currentMessage.startTime, 'ms');
            if (accumulationTimer) {
                clearTimeout(accumulationTimer);
            }
            ipcRenderer.sendResponseToMain(currentMessage.id, {
                status: accumulatedResponses.length > 0 ? 'partial' : 'error',
                message: 'Message timeout - no confirmation received',
                contents: accumulatedResponses
            });
            currentMessage = null;
            return;
        }

        // Continue monitoring if message not found
        if (currentMessage) {
            setTimeout(monitorMessages, 100);
        }
    }

    // Function to send a message using DataTransfer (without using clipboard)
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
                message: 'Message box not found'
            });
            currentMessage = null;
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
                message: `Error sending message: ${error.message}`
            });
            currentMessage = null;
        }
    }

})();
