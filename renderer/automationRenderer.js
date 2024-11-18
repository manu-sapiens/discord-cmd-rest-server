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
    const ACCUMULATION_TIMEOUT = 5000; // 5 seconds to accumulate responses

    console.log('[RENDERER:INIT] Setting up with constants:', {
        MESSAGE_BOX_SELECTOR,
        MESSAGE_AUTHOR_SELECTOR,
        AVRAE_USERNAME,
        ACCUMULATION_TIMEOUT
    });

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
        
        // Force garbage collection if available (in Node.js context)
        if (typeof global !== 'undefined' && global.gc) {
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
            
            // Force clear again if verification failed
            currentMessage = null;
            accumulatedResponses = [];
            if (accumulationTimer) {
                clearTimeout(accumulationTimer);
                accumulationTimer = null;
            }
        }
        
        // Log final state
        console.log('[RENDERER] State after clearing:', {
            reason,
            currentMessageExists: currentMessage !== null,
            accumulatedResponsesLength: accumulatedResponses.length,
            timerExists: accumulationTimer !== null
        });
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
                    console.log('[RENDERER:STATE] Looking for echo:', {
                        expectedText: currentMessage.text,
                        actualContent: messageContent,
                        author,
                        isCommand: currentMessage.text.startsWith('!'),
                        wouldMatch: messageContent.includes(currentMessage.text)
                    });
                    
                    const isCommand = currentMessage.text.startsWith('!');
                    const isEcho = messageContent.includes(currentMessage.text);
                    
                    // For commands: proceed if it's an echo OR if we see a bot response
                    // For non-commands: only proceed if we see the echo
                    if (isEcho || (isCommand && author.includes(AVRAE_USERNAME))) {
                        const transitionReason = isEcho ? 'echo_found' : 'command_bot_response';
                        console.log('[RENDERER:STATE] Transitioning to waiting_for_bot:', {
                            reason: transitionReason,
                            messageContent,
                            author,
                            timeFromStart: Date.now() - currentMessage.startTime
                        });
                        
                        currentMessage.state = 'waiting_for_bot';
                        accumulatedResponses = [];
                        logCurrentMessage('after_echo_found');
                        
                        // If we transitioned due to a bot response, process it now
                        if (transitionReason === 'command_bot_response') {
                            console.log('[RENDERER:STATE] Processing first bot response immediately');
                            accumulatedResponses.push({
                                text: messageContent,
                                sender: author
                            });
                        }
                    }
                }
                else if (currentMessage.state === 'waiting_for_bot' && author.includes(AVRAE_USERNAME)) {
                    logCurrentMessage('before_bot_response');
                    console.log('[RENDERER:STATE] Processing bot response:', {
                        state: currentMessage.state,
                        messageContent,
                        author,
                        timeFromStart: Date.now() - currentMessage.startTime,
                        accumulatedCount: accumulatedResponses.length,
                        hasTimer: accumulationTimer !== null
                    });
                    
                    // Clean up message content for matching (remove markdown formatting)
                    const cleanContent = messageContent.replace(/```[a-z]*\n|\n```/g, '').trim();
                    const responseMatches = Array.isArray(currentMessage.options.responseMatch) 
                        ? currentMessage.options.responseMatch 
                        : currentMessage.options.responseMatch 
                            ? [currentMessage.options.responseMatch]
                            : [];

                    console.log('[RENDERER:DEBUG] Cleaned message content for matching:', {
                        original: messageContent,
                        cleaned: cleanContent,
                        hasMatches: responseMatches.length > 0,
                        matchPatterns: responseMatches
                    });

                    // Check each match pattern in order
                    let matchIndex = -1;
                    let matchedPattern = null;
                    if (responseMatches.length > 0) {
                        matchIndex = responseMatches.findIndex(pattern => 
                            cleanContent.toLowerCase().includes(pattern.toLowerCase())
                        );
                        if (matchIndex !== -1) {
                            matchedPattern = responseMatches[matchIndex];
                        }
                    }

                    // If we found a match, send immediately and exit
                    if (matchedPattern) {
                        console.log('[RENDERER:DEBUG] Found matching response:', {
                            matchedPattern,
                            matchIndex,
                            timeFromStart: Date.now() - currentMessage.startTime
                        });

                        // Clear accumulation timer since we found a match
                        if (accumulationTimer) {
                            console.log('[RENDERER:TIMER] Clearing accumulation timer due to match');
                            clearTimeout(accumulationTimer);
                            accumulationTimer = null;
                        }

                        // First clear state
                        const msgId = currentMessage.id;
                        clearState('matching_response_found');

                        // Then send response after state is cleared
                        ipcRenderer.sendResponseToMain(msgId, {
                            status: 'success',
                            message: 'Found matching response',
                            response: {
                                text: cleanContent,
                                author: author,
                                isBot: true,
                                isDM: false,
                                timestamp: new Date().toISOString(),
                                matched: matchedPattern,
                                matchIndex: matchIndex
                            },
                            responses: accumulatedResponses,
                            elapsedTime: Date.now() - currentMessage.startTime
                        });
                        return; // Exit the entire function
                    }

                    // If this is our first bot response, notify main process and start accumulation timer
                    if (accumulatedResponses.length === 0) {
                        const startTime = Date.now();
                        console.log('[RENDERER:TIMER] About to start accumulation timer:', {
                            timeout: ACCUMULATION_TIMEOUT,
                            startTime,
                            willEndAt: new Date(startTime + ACCUMULATION_TIMEOUT).toISOString()
                        });

                        ipcRenderer.sendResponseToMain(currentMessage.id, {
                            status: 'receiving_responses',
                            message: 'Started receiving bot responses',
                            response: {
                                text: messageContent,
                                author: author,
                                isBot: true,
                                isDM: false,
                                timestamp: new Date().toISOString(),
                                matched: null
                            },
                            responses: accumulatedResponses,
                            elapsedTime: Date.now() - currentMessage.startTime
                        });

                        // Start accumulation timer only on first response
                        console.log('[RENDERER:TIMER] Creating accumulation timer with timeout:', ACCUMULATION_TIMEOUT);

                        accumulationTimer = setTimeout(() => {
                            const endTime = Date.now();
                            console.log('[RENDERER:TIMER] Accumulation timer FIRED:', {
                                startTime,
                                endTime,
                                actualDuration: endTime - startTime,
                                expectedDuration: ACCUMULATION_TIMEOUT,
                                difference: (endTime - startTime) - ACCUMULATION_TIMEOUT
                            });

                            const msgId = currentMessage.id;
                            const hadMatches = responseMatches.length > 0;
                            const finalResponse = {
                                status: hadMatches ? 'error' : 'success',
                                message: hadMatches 
                                    ? `No matching response found. Looking for: ${responseMatches.join(', ')}`
                                    : 'Accumulated all bot responses',
                                response: {
                                    text: accumulatedResponses.map(r => r.text).join('\n'),
                                    author: AVRAE_USERNAME,
                                    isBot: true,
                                    isDM: false,
                                    timestamp: new Date().toISOString(),
                                    matched: null,
                                    matchIndex: -1
                                },
                                responses: accumulatedResponses,
                                elapsedTime: Date.now() - currentMessage.startTime
                            };

                            console.log('[RENDERER:TIMER] Preparing to send final response after timer:', {
                                status: finalResponse.status,
                                responseCount: accumulatedResponses.length,
                                timeFromStart: Date.now() - currentMessage.startTime,
                                message: finalResponse.message,
                                currentMessageExists: currentMessage !== null,
                                currentMessageState: currentMessage?.state
                            });

                            // First clear state
                            clearState('accumulation_timeout');
                            
                            console.log('[RENDERER:TIMER] State cleared, sending final response');
                            
                            // Then send response
                            ipcRenderer.sendResponseToMain(msgId, finalResponse);

                            console.log('[RENDERER:TIMER] Final response sent');
                        }, ACCUMULATION_TIMEOUT);

                        console.log('[RENDERER:TIMER] Accumulation timer created:', {
                            timerExists: accumulationTimer !== null,
                            timeout: ACCUMULATION_TIMEOUT,
                            currentTime: new Date().toISOString()
                        });
                    }
                    
                    accumulatedResponses.push({
                        text: messageContent,
                        sender: author
                    });

                    console.log('[RENDERER:DEBUG] Added response to accumulated list:', {
                        totalResponses: accumulatedResponses.length,
                        latestResponse: messageContent.substring(0, 100) + '...',
                        timeFromStart: Date.now() - currentMessage.startTime
                    });

                }
            }
        }

        // Check timeout
        logCurrentMessage('before_timeout_check');
        const timeElapsed = Date.now() - currentMessage.startTime;
        const hasStartedAccumulating = accumulatedResponses.length > 0;
        const effectiveTimeout = hasStartedAccumulating ? ACCUMULATION_TIMEOUT : (currentMessage.options.timeout || 5000);

        console.log('[RENDERER:DEBUG] Checking timeout:', {
            timeElapsed,
            hasStartedAccumulating,
            effectiveTimeout,
            accumulatedResponses: accumulatedResponses.length,
            state: currentMessage.state
        });

        if (currentMessage && timeElapsed > effectiveTimeout) {
            console.error('[RENDERER] Message timeout detected:', {
                messageAge: timeElapsed,
                effectiveTimeout,
                originalTimeout: currentMessage.options.timeout || 5000,
                state: currentMessage.state,
                accumulatedResponses: accumulatedResponses.length
            });

            // Clear any existing accumulation timer
            if (accumulationTimer) {
                console.log('[RENDERER:TIMER] Clearing accumulation timer due to timeout');
                clearTimeout(accumulationTimer);
                accumulationTimer = null;
            }

            const msgId = currentMessage.id;
            const hadMatches = responseMatches.length > 0;
            const response = {
                status: hadMatches ? 'error' : 'success',
                message: hadMatches 
                    ? `No matching response found. Looking for: ${responseMatches.join(', ')}`
                    : 'Accumulated all bot responses',
                response: {
                    text: accumulatedResponses.map(r => r.text).join('\n'),
                    author: AVRAE_USERNAME,
                    isBot: true,
                    isDM: false,
                    timestamp: new Date().toISOString(),
                    matched: null,
                    matchIndex: -1
                },
                responses: accumulatedResponses,
                elapsedTime: timeElapsed
            };
            
            // Clear state before sending response
            clearState('message_timeout');
            
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
                response: {
                    text: 'Message became stale',
                    author: AVRAE_USERNAME,
                    isBot: true,
                    isDM: false,
                    timestamp: new Date().toISOString(),
                    matched: null
                },
                responses: accumulatedResponses,
                elapsedTime: Date.now() - currentMessage.startTime
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
                message: 'Message box not found',
                response: {
                    text: 'Message box not found',
                    author: AVRAE_USERNAME,
                    isBot: true,
                    isDM: false,
                    timestamp: new Date().toISOString(),
                    matched: null
                },
                responses: [],
                elapsedTime: Date.now() - message.startTime
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
                response: {
                    text: 'Error sending message',
                    author: AVRAE_USERNAME,
                    isBot: true,
                    isDM: false,
                    timestamp: new Date().toISOString(),
                    matched: null
                },
                responses: [],
                elapsedTime: Date.now() - message.startTime
            });
            clearState('error_sending_message');
        }
    }

})();
