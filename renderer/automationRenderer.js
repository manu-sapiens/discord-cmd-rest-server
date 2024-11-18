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

    function logMessageState(location, action) {
        console.log(`[STATE:${location}] ${action}:`, {
            hasCurrentMessage: currentMessage !== null,
            messageId: currentMessage?.id,
            messageText: currentMessage?.text,
            state: currentMessage?.state,
            age: currentMessage ? Date.now() - currentMessage.startTime : null,
            hasTimer: accumulationTimer !== null
        });
    }

    function logCurrentMessage(location) {
        console.log(`[DEBUG:${location}] currentMessage:`, {
            exists: currentMessage !== null,
            id: currentMessage?.id,
            text: currentMessage?.text,
            state: currentMessage?.state,
            age: currentMessage ? Date.now() - currentMessage.startTime : null
        });
    }

    function clearState(reason) {
        console.log('[RENDERER] Clearing state:', {
            reason,
            hadMessage: currentMessage !== null,
            messageId: currentMessage?.id,
            messageState: currentMessage?.state,
            hadTimer: accumulationTimer !== null,
            stackTrace: new Error().stack
        });
        
        // Clear any existing timers
        if (accumulationTimer) {
            clearTimeout(accumulationTimer);
            accumulationTimer = null;
        }

        // Log state before clearing
        logCurrentMessage('before_clear');
        
        // Clear all state variables
        currentMessage = null;
        accumulatedResponses = [];
        
        // Force garbage collection of large objects
        if (global.gc) {
            global.gc();
        }
        
        // Log state after clearing
        logCurrentMessage('after_clear');
        
        // Verify state is actually cleared
        if (currentMessage !== null || accumulatedResponses.length > 0 || accumulationTimer !== null) {
            console.error('[RENDERER] Failed to clear state completely:', {
                reason,
                currentMessageExists: currentMessage !== null,
                accumulatedResponsesLength: accumulatedResponses.length,
                timerExists: accumulationTimer !== null
            });
        }
    }

    // Verify if current message is stale
    function isMessageStale() {
        if (!currentMessage) return false;
        
        const timeSinceStart = Date.now() - currentMessage.startTime;
        const timeout = currentMessage.options.timeout || 5000;
        
        // Message is stale if:
        // 1. It's been processing longer than timeout
        // 2. It's stuck in waiting_for_echo for more than 5 seconds
        const isStale = timeSinceStart > timeout || 
                       (currentMessage.state === 'waiting_for_echo' && timeSinceStart > 5000);
        
        if (isStale) {
            console.warn('[RENDERER] Detected stale message:', {
                messageId: currentMessage.id,
                state: currentMessage.state,
                age: timeSinceStart,
                timeout
            });
        }
        
        return isStale;
    }

    // Listen for messages from main process via IPC
    ipcRenderer.receiveMessageFromMain((messageData) => {
        const { messageId, messageText, botUsername, humanUsername, options } = messageData;

        // Handle cleanup message
        if (messageText === '__cleanup__') {
            console.log('[RENDERER] Received cleanup signal for message:', messageId);
            if (currentMessage && currentMessage.id === messageId) {
                clearState('cleanup_from_queue_processor');
            }
            return;
        }

        console.log('[RENDERER] Received message to send:', {
            messageId,
            text: messageText,
            currentState: {
                processing: currentMessage !== null,
                currentMessageId: currentMessage?.id,
                currentCommand: currentMessage?.text,
                currentState: currentMessage?.state,
                age: currentMessage ? Date.now() - currentMessage.startTime : null
            }
        });

        // Check for stale state before rejecting
        if (currentMessage && isMessageStale()) {
            console.warn('[RENDERER] Clearing stale message before processing new message');
            clearState('stale_message_detected');
        }

        if (currentMessage) {
            console.error(`[RENDERER] A message is already being processed: text: ${currentMessage.text}, state: ${currentMessage.state}, options: ${JSON.stringify(currentMessage.options)}, id: ${currentMessage.id}, age: ${Date.now() - currentMessage.startTime}, timeout: ${currentMessage.options.timeout || 5000}, timeRunning: ${Date.now() - currentMessage.startTime}`);
            ipcRenderer.sendResponseToMain(messageId, {
                status: 'error',
                message: 'Another command is currently being processed.',
                details: {
                    currentCommand: currentMessage.text,
                    currentState: currentMessage.state,
                    options: currentMessage.options,
                    id: currentMessage.id,
                    age: Date.now() - currentMessage.startTime,
                    timeRunning: Date.now() - currentMessage.startTime
                }
            });
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

        logCurrentMessage('after_new_message');

        // Start processing the message
        sendMessage(currentMessage);
        monitorMessages();
    });

    // Monitor for message confirmation and bot responses
    function monitorMessages() {
        logCurrentMessage('monitor_start');
        const messages = document.querySelectorAll('[class*="message__"]');
        const lastMessages = Array.from(messages).slice(-3);
        
        if (currentMessage) {
            console.log('[RENDERER] Checking messages for:', {
                expectedText: currentMessage.text,
                state: currentMessage.state,
                messageCount: lastMessages.length
            });
            
            // Use a for...of loop instead of forEach so we can break out completely
            for (const message of lastMessages) {
                logCurrentMessage('before_message_check');
                const messageContent = message.textContent;
                const authorElement = message.querySelector(MESSAGE_AUTHOR_SELECTOR);
                const author = authorElement ? authorElement.textContent.trim() : '';
                
                console.log('[RENDERER] Examining message:', {
                    content: messageContent,
                    author: author,
                    includesText: messageContent.includes(currentMessage.text)
                });
                
                if (currentMessage.state === 'waiting_for_echo') {
                    // Look for our message in the chat
                    if (messageContent.includes(currentMessage.text)) {
                        console.log('[RENDERER] Found our message in chat, transitioning from waiting_for_echo to waiting_for_bot');
                        currentMessage.state = 'waiting_for_bot';
                        accumulatedResponses = [];
                        logCurrentMessage('after_echo_found');
                    }
                }
                else if (currentMessage.state === 'waiting_for_bot' && author.includes(AVRAE_USERNAME)) {
                    logCurrentMessage('before_bot_response');
                    console.log('[RENDERER] Found bot response while in waiting_for_bot state:', messageContent);
                    accumulatedResponses.push({
                        text: messageContent,
                        sender: author
                    });

                    // Clean up message content for matching (remove markdown formatting)
                    const cleanContent = messageContent.replace(/```[a-z]*\n|\n```/g, '').trim();
                    console.log('[RENDERER] Cleaned message content for matching:', {
                        original: messageContent,
                        cleaned: cleanContent,
                        responseMatch: currentMessage.options.responseMatch,
                        wouldMatch: cleanContent.toLowerCase().includes(currentMessage.options.responseMatch.toLowerCase())
                    });

                    // If we have a responseMatch and it matches, send immediately and exit
                    if (currentMessage.options.responseMatch && 
                        cleanContent.toLowerCase().includes(currentMessage.options.responseMatch.toLowerCase())) {
                        console.log('[RENDERER] Found matching response, clearing state');
                        logCurrentMessage('before_success_response');

                        // First clear state
                        const msgId = currentMessage.id;
                        clearState('matching_response_found');
                        logCurrentMessage('after_clear_before_send');

                        // Then send response after state is cleared
                        ipcRenderer.sendResponseToMain(msgId, {
                            status: 'success',
                            message: 'Found matching response',
                            contents: accumulatedResponses
                        });
                        logCurrentMessage('after_success_response');
                        return; // Exit the entire function
                    }
                    
                    // Otherwise, start new accumulation timer
                    if (accumulationTimer) {
                        console.log('[RENDERER] Clearing existing accumulation timer');
                        clearTimeout(accumulationTimer);
                    }
                    console.log('[RENDERER] Starting new accumulation timer');
                    accumulationTimer = setTimeout(() => {
                        logCurrentMessage('before_timeout_response');
                        console.log('[RENDERER] Accumulation timeout reached, clearing state');
                        ipcRenderer.sendResponseToMain(currentMessage.id, {
                            status: 'success',
                            message: 'Received bot responses',
                            contents: accumulatedResponses
                        });
                        clearState('accumulation_timeout');
                        logCurrentMessage('after_timeout_response');
                    }, ACCUMULATION_TIMEOUT);
                }
            }
        }

        // Check timeout
        logCurrentMessage('before_timeout_check');
        if (currentMessage && Date.now() - currentMessage.startTime > (currentMessage.options.timeout || 5000)) {
            console.error('[RENDERER] Message timeout detected:', {
                messageAge: Date.now() - currentMessage.startTime,
                timeout: currentMessage.options.timeout || 5000,
                state: currentMessage.state
            });
            const msgId = currentMessage.id;
            const response = {
                status: accumulatedResponses.length > 0 ? 'partial' : 'error',
                message: 'Message timeout - no confirmation received',
                contents: accumulatedResponses
            };
            
            // Clear state before sending response
            clearState('message_timeout');
            logCurrentMessage('after_timeout_clear');
            
            // Send response after state is cleared
            ipcRenderer.sendResponseToMain(msgId, response);
            return; // Exit the function after timeout
        }

        // Check for stale message state
        if (isMessageStale()) {
            const msgId = currentMessage.id;
            const response = {
                status: 'error',
                message: 'Message became stale - clearing state',
                contents: accumulatedResponses
            };
            
            // Clear state before sending response
            clearState('stale_message');
            logCurrentMessage('after_stale_clear');
            
            // Send response after state is cleared
            ipcRenderer.sendResponseToMain(msgId, response);
            return; // Exit the function after stale check
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
            clearState('message_box_not_found');
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
                details: {
                    messageBoxContent: messageBox.textContent,
                    expectedText: message.text
                }
            });
            clearState('error_sending_message');
        }
    }

})();
