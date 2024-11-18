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
                    responses: pending.responses // Return any accumulated responses
                };
                pending.resolve(timeoutResponse);
                pendingMessages.delete(messageId);
            }
        }, timeout);

        // Store the timeout ID
        const pending = pendingMessages.get(messageId);
        pending.timeoutId = timeoutId;
        pendingMessages.set(messageId, pending);
    });
}

function processNextMessage() {
    if (messageQueue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const message = messageQueue[0];
    const mainWindow = getMainWindow();

    if (!mainWindow) {
        console.error('Main window not available');
        messageQueue.shift();
        processNextMessage();
        return;
    }

    console.log('Sending message to renderer:', message.messageText);
    mainWindow.webContents.send('send-message-to-renderer', message);
}

function handleMessageResponse(messageId, response) {
    console.log('Received response for messageId', messageId, ':', response);
    
    const pending = pendingMessages.get(messageId);
    if (!pending) {
        console.log('No pending message found for messageId', messageId);
        return;
    }

    if (response.status === 'success') {
        // If we have a responseMatch option, check if any response matches
        if (pending.options.responseMatch && response.contents) {
            const matchingResponse = response.contents.find(r => 
                r.text.toLowerCase().includes(pending.options.responseMatch.toLowerCase())
            );
            
            if (matchingResponse) {
                // Found matching response
                pending.resolve({
                    status: 'success',
                    message: 'Found matching response',
                    response: matchingResponse
                });
                pendingMessages.delete(messageId);
            } else {
                // Store responses for potential timeout
                pending.responses.push(...response.contents);
            }
        } else {
            // No matching required, resolve with all responses
            pending.resolve(response);
            pendingMessages.delete(messageId);
        }
    } else if (response.status === 'error') {
        pending.reject(new Error(response.message));
        pendingMessages.delete(messageId);
    }

    // Process next message in queue
    messageQueue.shift();
    processNextMessage();
}

function handleDiscordMessage(message) {
    // Skip our own messages (non-bot messages)
    if (!message.isBot) {
        if (process.env.DEBUG) {
            console.log('Skipping non-bot message:', {
                content: message.content,
                author: message.author
            });
        }
        return;
    }

    console.log('\nProcessing Discord message for matches:', {
        content: message.content,
        author: message.author,
        isBot: message.isBot,
        isDM: message.isDM
    });

    // Check all pending messages for matches
    console.log('Current pending messages:', Array.from(pendingMessages.keys()));
    
    for (const [messageId, pending] of pendingMessages.entries()) {
        console.log(`\nChecking messageId ${messageId}:`, {
            responseMatch: pending.options.responseMatch,
            startTime: new Date(pending.startTime).toISOString(),
            responseCount: pending.responses.length
        });

        // Skip if no responseMatch is required
        if (!pending.options.responseMatch) {
            console.log('No responseMatch required, skipping');
            continue;
        }

        // Check if message content matches the expected response
        const messageContent = message.content.toLowerCase();
        const responseMatch = pending.options.responseMatch.toLowerCase();
        console.log('Matching:', {
            messageContent,
            responseMatch,
            includes: messageContent.includes(responseMatch)
        });

        if (messageContent.includes(responseMatch)) {
            console.log('Found matching Discord response for messageId', messageId);
            
            try {
                // Clear the timeout
                if (pending.timeoutId) {
                    console.log('Clearing timeout for messageId', messageId);
                    clearTimeout(pending.timeoutId);
                }

                // Format the response nicely
                const response = {
                    text: message.content,
                    author: message.author,
                    isBot: message.isBot,
                    isDM: message.isDM,
                    timestamp: new Date().toISOString(),
                    matched: responseMatch
                };

                const result = {
                    status: 'success',
                    message: 'Found matching response',
                    response,
                    elapsedTime: Date.now() - pending.startTime
                };

                console.log('Resolving promise with result:', result);
                
                // Remove from tracking before resolving to prevent race conditions
                pendingMessages.delete(messageId);
                messageQueue = messageQueue.filter(m => m.messageId !== messageId);
                
                // Resolve the promise
                pending.resolve(result);
                console.log('Promise resolved successfully');
                
                return;
            } catch (error) {
                console.error('Error resolving promise:', error);
                pending.reject(error);
                pendingMessages.delete(messageId);
                return;
            }
        }

        // Store response for potential timeout
        console.log('No match, storing response for later');
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
