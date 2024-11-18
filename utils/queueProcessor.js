// utils/queueProcessor.js
// --------------------------------
const { ipcMain } = require('electron');
const { getMainWindow } = require('./windowManager');
// --------------------------------

const DEFAULT_TIMEOUT = 20000; // 20 seconds
const POST_RESOLVE_TIMEOUT = 5000; // 5 seconds for cleanup

let messageQueue = [];
let isProcessing = false;
let pendingMessages = new Map();

function enqueueMessage({ messageText, botUsername, humanUsername, options }) {
    console.log('\nEnqueueing message with options:', {
        messageText,
        botUsername,
        humanUsername,
        options
    });
    
    return new Promise((resolve, reject) => {
        const messageId = Date.now() + Math.random();
        console.log('Generated messageId:', messageId);
        
        // Store the promise callbacks and options with the message ID
        pendingMessages.set(messageId, {
            resolve,
            reject,
            options,
            responses: [], // Store accumulated bot responses
            startTime: Date.now(),
            timeoutId: null // Store timeout ID for clearing
        });

        console.log('Stored pending message with options:', {
            messageId,
            options,
            pendingCount: pendingMessages.size
        });

        messageQueue.push({
            messageId,
            messageText,
            botUsername,
            humanUsername,
            options
        });

        // Start processing if not already running
        if (!isProcessing) {
            processNextMessage();
        }

        // Set timeout for message
        const timeout = options.timeout || DEFAULT_TIMEOUT;
        const timeoutId = setTimeout(() => {
            const pending = pendingMessages.get(messageId);
            if (pending) {
                console.log('Timeout reached for messageId', messageId, {
                    responseCount: pending.responses.length,
                    elapsedTime: Date.now() - pending.startTime,
                    timeout
                });

                const timeoutResponse = {
                    status: 'error',
                    message: `Message timeout after ${timeout}ms - no matching response received`,
                    response: {
                        text: 'Timeout - no matching response received',
                        author: 'System',
                        isBot: false,
                        isDM: false,
                        timestamp: new Date().toISOString(),
                        matched: null
                    },
                    elapsedTime: Date.now() - pending.startTime
                };
                
                // Clear timeout and cleanup
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                    pending.timeoutId = null;
                }

                // Send cleanup signal to renderer
                const mainWindow = getMainWindow();
                if (mainWindow) {
                    mainWindow.webContents.send('send-message-to-renderer', {
                        messageId,
                        messageText: '__cleanup__',
                        botUsername: '',
                        humanUsername: '',
                        options: {}
                    });
                }

                // Cleanup state
                pendingMessages.delete(messageId);
                messageQueue = messageQueue.filter(m => m.messageId !== messageId);
                
                // Resolve after a small delay to ensure cleanup is processed
                setTimeout(() => {
                    pending.resolve(timeoutResponse);
                    // Process next message if any
                    processNextMessage();
                }, POST_RESOLVE_TIMEOUT);
            }
        }, timeout);

        // Store the timeout ID
        const pending = pendingMessages.get(messageId);
        pending.timeoutId = timeoutId;
        pendingMessages.set(messageId, pending);
    });
}

// Manage the message queue
function processNextMessage() {
    if (messageQueue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const message = messageQueue[0];
    
    try {
        // Attempt to deliver the message
        if (!deliverMessage(message)) {
            console.error(`[CRITICAL] Message delivery failed for message ID ${message.messageId}:`, {
                text: message.messageText,
                user: message.humanUsername,
                queueLength: messageQueue.length,
                timestamp: new Date().toISOString()
            });

            // Notify the user about the failure
            const errorResponse = {
                status: 'error',
                message: 'Failed to deliver message - Discord window not available',
                error: {
                    type: 'DELIVERY_FAILURE',
                    messageId: message.messageId,
                    timestamp: new Date().toISOString()
                }
            };

            // Try to resolve the message promise with error
            const pending = pendingMessages.get(message.messageId);
            if (pending) {
                if (pending.timeoutId) {
                    clearTimeout(pending.timeoutId);
                }
                pending.resolve(errorResponse);
                pendingMessages.delete(message.messageId);
            }

            // Remove failed message and try next one
            console.warn(`[QUEUE] Removing failed message from queue. ${messageQueue.length - 1} messages remaining`);
            messageQueue.shift();
            processNextMessage();
            return;
        }
    } catch (error) {
        console.error('[CRITICAL] Unexpected error in message processing:', {
            error: error.message,
            stack: error.stack,
            messageId: message.messageId,
            text: message.messageText
        });

        // Handle the error similarly to delivery failure
        const errorResponse = {
            status: 'error',
            message: 'Unexpected error in message processing',
            error: {
                type: 'PROCESSING_ERROR',
                messageId: message.messageId,
                details: error.message,
                timestamp: new Date().toISOString()
            }
        };

        const pending = pendingMessages.get(message.messageId);
        if (pending) {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
            pending.resolve(errorResponse);
            pendingMessages.delete(message.messageId);
        }

        messageQueue.shift();
        processNextMessage();
    }
}

// Handle the actual message delivery
function deliverMessage(message) {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
        console.error('[CRITICAL] Main window not available for message delivery:', {
            messageId: message.messageId,
            windowState: 'NOT_AVAILABLE',
            timestamp: new Date().toISOString()
        });
        return false;
    }

    if (!mainWindow.webContents) {
        console.error('[CRITICAL] Window web contents not available:', {
            messageId: message.messageId,
            windowState: 'NO_WEBCONTENTS',
            timestamp: new Date().toISOString()
        });
        return false;
    }

    try {
        console.log('[DELIVERY] Sending message to renderer:', {
            messageId: message.messageId,
            text: message.messageText,
            timestamp: new Date().toISOString()
        });
        mainWindow.webContents.send('send-message-to-renderer', message);
        return true;
    } catch (error) {
        console.error('[CRITICAL] Failed to send message to renderer:', {
            error: error.message,
            stack: error.stack,
            messageId: message.messageId,
            text: message.messageText,
            timestamp: new Date().toISOString()
        });
        return false;
    }
}

function handleMessageResponse(messageId, response) {
    const pending = pendingMessages.get(messageId);
    if (!pending) {
        console.log('No pending message found for messageId', messageId);
        return;
    }

    console.log('Received response for messageId', messageId, ':', response);
    
    // Clear timeout and cleanup
    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
        pending.timeoutId = null;
    }

    // Send cleanup signal to renderer
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.webContents.send('send-message-to-renderer', {
            messageId,
            messageText: '__cleanup__',
            botUsername: '',
            humanUsername: '',
            options: {}
        });
    }

    // Cleanup state
    pendingMessages.delete(messageId);
    messageQueue = messageQueue.filter(m => m.messageId !== messageId);
    
    // Resolve the promise
    pending.resolve(response);
    
    // Process next message if any
    processNextMessage();
}

function handleDiscordMessage(message) {
    if (!message.isBot) {
        return;
    }

    console.log('\nProcessing Discord message:', {
        content: message.content,
        author: message.author
    });

    // Check all pending messages for matches
    for (const [messageId, pending] of pendingMessages.entries()) {
        if (!pending.options.responseMatch) {
            continue;
        }

        const messageContent = message.content.toLowerCase();
        const responseMatch = pending.options.responseMatch.toLowerCase();

        if (messageContent.includes(responseMatch)) {

            console.log('Match found:', {
                messageContent,
                responseMatch
            });

            // Clear timeout and format response
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
                pending.timeoutId = null;
            }

            const result = {
                status: 'success',
                message: 'Found matching response',
                response: {
                    text: message.content,
                    author: message.author,
                    isBot: message.isBot,
                    isDM: message.isDM,
                    timestamp: new Date().toISOString(),
                    matched: responseMatch
                },
                elapsedTime: Date.now() - pending.startTime
            };

            // Send cleanup signal to renderer
            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.webContents.send('send-message-to-renderer', {
                    messageId,
                    messageText: '__cleanup__',
                    botUsername: '',
                    humanUsername: '',
                    options: {}
                });
            }

            // Cleanup state
            pendingMessages.delete(messageId);
            messageQueue = messageQueue.filter(m => m.messageId !== messageId);
            
            // Resolve after a small delay to ensure cleanup is processed
            setTimeout(() => {
                pending.resolve(result);
                // Process next message
                processNextMessage();
            }, POST_RESOLVE_TIMEOUT);
            
            return;
        }

        // Store response for potential timeout
        pending.responses.push({
            text: message.content,
            author: message.author,
            isBot: message.isBot,
            isDM: message.isDM,
            timestamp: new Date().toISOString()
        });
    }
}

function logPendingMessages() {
    console.log('\nCurrent pending messages:', {
        count: pendingMessages.size,
        ids: Array.from(pendingMessages.keys())
    });
}

setInterval(logPendingMessages, 5000);

function initializeQueueProcessor() {
    // Clear any existing listeners
    ipcMain.removeAllListeners('message-response');
    
    // Set up new listener for renderer responses
    ipcMain.on('message-response', (event, { messageId, response }) => {
        handleMessageResponse(messageId, response);
    });

    // Get Discord service to listen for messages
    const DiscordService = require('../discord/service');
    const discordService = require('../routes/discord/message').discordService;

    if (discordService) {
        discordService.on('message', handleDiscordMessage);
    }
    
    console.log('Queue processor initialized');
}

module.exports = {
    enqueueMessage,
    handleMessageResponse,
    initializeQueueProcessor,
    handleDiscordMessage
};
