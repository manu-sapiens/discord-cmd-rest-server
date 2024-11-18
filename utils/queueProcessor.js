// utils/queueProcessor.js
// --------------------------------
const { ipcMain } = require('electron');
const { getMainWindow } = require('./windowManager');
const { updateMap, updateOtherImage } = require('./imageViewerManager');
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
                    message: pending.options.responseMatch 
                        ? Array.isArray(pending.options.responseMatch)
                            ? `Message timeout after ${timeout}ms - no matching response found. Looking for: ${pending.options.responseMatch.join(', ')}`
                            : `Message timeout after ${timeout}ms - no matching response found. Looking for: ${pending.options.responseMatch}`
                        : `Message timeout after ${timeout}ms - no matching response received`,
                    response: {
                        text: 'Timeout - no matching response received',
                        author: 'System',
                        isBot: false,
                        isDM: false,
                        timestamp: new Date().toISOString(),
                        matched: null,
                        matchIndex: -1
                    },
                    responses: pending.responses,
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
        console.log('[MAIN:DEBUG] No pending message found for messageId', messageId);
        return;
    }

    console.log('[MAIN:DEBUG] Received response for messageId:', {
        messageId,
        status: response.status,
        timeFromStart: Date.now() - pending.startTime,
        hasTimeout: pending.timeoutId !== null,
        responseMatch: pending.options.responseMatch
    });
    
    // If we're just starting to receive responses, clear the timeout and set a shorter one
    if (response.status === 'receiving_responses') {
        console.log('[MAIN:DEBUG] Bot started responding, handling timeouts:', {
            messageId,
            timeFromStart: Date.now() - pending.startTime,
            hadTimeout: pending.timeoutId !== null
        });

        if (pending.timeoutId) {
            console.log('[MAIN:DEBUG] Clearing original timeout');
            clearTimeout(pending.timeoutId);
            pending.timeoutId = null;
        }

        // Set a new timeout for 10 seconds in case something goes wrong with the renderer
        console.log('[MAIN:DEBUG] Setting backup timeout');
        pending.timeoutId = setTimeout(() => {
            console.log('[MAIN:DEBUG] Backup timeout fired:', {
                messageId,
                timeFromStart: Date.now() - pending.startTime,
                hadResponses: response.responses?.length > 0
            });

            const timeoutResponse = {
                status: 'error',
                message: 'Backup timeout - renderer process did not complete',
                response: response.response || {
                    text: 'Timeout - renderer process did not complete',
                    author: 'System',
                    isBot: false,
                    isDM: false,
                    timestamp: new Date().toISOString(),
                    matched: null
                },
                responses: response.responses || [],
                elapsedTime: Date.now() - pending.startTime
            };
            
            console.log('[MAIN:DEBUG] Sending backup timeout response:', {
                messageId,
                status: timeoutResponse.status,
                message: timeoutResponse.message,
                timeFromStart: Date.now() - pending.startTime
            });

            // Clear state and resolve
            pendingMessages.delete(messageId);
            messageQueue = messageQueue.filter(m => m.messageId !== messageId);
            pending.resolve(timeoutResponse);

            // Send cleanup signal to renderer
            const mainWindow = getMainWindow();
            if (mainWindow) {
                console.log('[MAIN:DEBUG] Sending cleanup signal to renderer');
                mainWindow.webContents.send('send-message-to-renderer', {
                    messageId,
                    messageText: '__cleanup__',
                    botUsername: '',
                    humanUsername: '',
                    options: {}
                });
            }

            // Process next message
            processNextMessage();
        }, 10000); // 10 second backup timeout

        return;
    }
    
    // Clear timeout and cleanup
    if (pending.timeoutId) {
        console.log('[MAIN:DEBUG] Clearing timeout for final response:', {
            messageId,
            status: response.status,
            timeFromStart: Date.now() - pending.startTime
        });
        clearTimeout(pending.timeoutId);
        pending.timeoutId = null;
    }

    console.log('[MAIN:DEBUG] Processing final response:', {
        messageId,
        status: response.status,
        timeFromStart: Date.now() - pending.startTime,
        message: response.message
    });

    // Cleanup state
    pendingMessages.delete(messageId);
    messageQueue = messageQueue.filter(m => m.messageId !== messageId);
    
    // Resolve immediately
    pending.resolve(response);

    // Send cleanup signal to renderer after resolving
    const mainWindow = getMainWindow();
    if (mainWindow) {
        console.log('[MAIN:DEBUG] Sending cleanup signal to renderer');
        mainWindow.webContents.send('send-message-to-renderer', {
            messageId,
            messageText: '__cleanup__',
            botUsername: '',
            humanUsername: '',
            options: {}
        });
    }

    // Process next message
    processNextMessage();
}

function handleDiscordMessage(message) {
    // Accept bot messages from either:
    // 1. The active channel, or
    // 2. DMs from Avrae
    if (!message.isBot || (!message.isActiveChannel && !(message.isDM && message.author.includes('Avrae')))) {
        return;
    }

    // Extract content from embeds if message content is empty
    let effectiveContent = message.content;
    let embedThumbnailUrl = null;

    function extractMarkdownUrls(text) {
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const urls = [];
        let match;
        
        console.log('Extracting URLs from text:', text);
        
        while ((match = markdownLinkRegex.exec(text)) !== null) {
            console.log('Found Markdown match:', {
                fullMatch: match[0],
                text: match[1],
                url: match[2]
            });
            urls.push({
                text: match[1],
                url: match[2]
            });
        }
        
        console.log('Extracted URLs:', urls);
        return urls;
    }

    function isMapUrl(url) {
        return url && (
            url.includes('otfbm.io') || // Standard Avrae battle maps
            url.includes('otfbm.com')    // Just in case they change the domain
        );
    }

    // First check for Markdown links in the content
    console.log('Message content before URL extraction:', effectiveContent);
    let mapUrl = null;
    let otherImageUrl = null;

    if (message.embeds && message.embeds.length > 0) {
        const embed = message.embeds[0];
        console.log('Processing embed:', JSON.stringify(embed, null, 2));
        
        // Check embed image first
        if (embed.image && embed.image.url) {
            console.log('Found embed image URL:', embed.image.url);
            if (isMapUrl(embed.image.url)) {
                mapUrl = embed.image.url;
            } else {
                otherImageUrl = embed.image.url;
            }
        }
        
        // If no map URL, check fields for Markdown links
        if (!mapUrl && embed.fields) {
            for (const field of embed.fields) {
                const fieldUrls = extractMarkdownUrls(field.value);
                const fieldMapUrl = fieldUrls.find(u => isMapUrl(u.url))?.url;
                if (fieldMapUrl) {
                    console.log('Found map URL in field:', fieldMapUrl);
                    mapUrl = fieldMapUrl;
                    break;
                }
            }
        }
        
        // If still no URLs, check thumbnail
        if (!mapUrl && !otherImageUrl && embed.thumbnail && embed.thumbnail.url) {
            console.log('Found thumbnail URL:', embed.thumbnail.url);
            if (isMapUrl(embed.thumbnail.url)) {
                mapUrl = embed.thumbnail.url;
            } else {
                otherImageUrl = embed.thumbnail.url;
            }
        }
        
        // Extract all possible content from embed
        const embedContent = [
            embed.author?.name,
            embed.title,
            embed.description,
            ...(embed.fields || []).map(f => `${f.name}: ${f.value}`)
        ].filter(Boolean).join('\n');

        effectiveContent = effectiveContent 
            ? `${effectiveContent}\n${embedContent}`
            : embedContent;
        
        console.log('\nExtracted embed content:', effectiveContent);
    }

    // If we found any URLs, use them
    if (mapUrl) {
        console.log('Using map URL:', mapUrl);
        embedThumbnailUrl = mapUrl;
        // Update the image viewer with the map
        updateMap(mapUrl);
    } else {
        console.log('No map URL found in any source');
    }

    if (otherImageUrl) {
        console.log('Found other image URL:', otherImageUrl);
        // Update the other image section
        updateOtherImage(otherImageUrl);
    }

    // Then check Markdown links in the content
    if (!embedThumbnailUrl) {
        const markdownUrls = extractMarkdownUrls(effectiveContent);
        const mapUrl = markdownUrls.find(u => isMapUrl(u.url))?.url;
        if (mapUrl) {
            console.log('Found map URL:', mapUrl);
            embedThumbnailUrl = mapUrl;
            // Update the image viewer with the map
            updateMap(mapUrl);
        } else {
            console.log('No map URL found in Markdown links');
        }
    }

    console.log('\nProcessing Discord message:', {
        content: effectiveContent,
        author: message.author,
        hasEmbeds: message.embeds?.length > 0
    });

    // Check all pending messages
    for (const [messageId, pending] of pendingMessages.entries()) {
        // Initialize accumulator if needed
        if (!pending.accumulator) {
            pending.accumulator = [];
        }

        // Try to match against current message immediately
        const responseMatches = Array.isArray(pending.options.responseMatch) 
            ? pending.options.responseMatch 
            : pending.options.responseMatch 
                ? [pending.options.responseMatch]
                : [];

        // Clear any existing timeout since we got a new message
        if (pending.accumulationTimeout) {
            clearTimeout(pending.accumulationTimeout);
            delete pending.accumulationTimeout;
        }

        // Add current message to accumulator
        pending.accumulator.push({
            content: effectiveContent,
            timestamp: Date.now()
        });

        let matched = false;
        if (responseMatches.length > 0) {
            // Try matching just this message
            let matchIndex = responseMatches.findIndex(pattern => 
                effectiveContent.toLowerCase().includes(pattern.toLowerCase())
            );

            // If no match, try matching against accumulated content
            let matchedContent = effectiveContent;
            if (matchIndex === -1) {
                const allContent = pending.accumulator.map(m => m.content).join('\n');
                matchIndex = responseMatches.findIndex(pattern => 
                    allContent.toLowerCase().includes(pattern.toLowerCase())
                );
                if (matchIndex !== -1) {
                    // Find which message had the match
                    const matchedMessage = pending.accumulator.find(m => 
                        m.content.toLowerCase().includes(responseMatches[matchIndex].toLowerCase())
                    );
                    matchedContent = matchedMessage ? matchedMessage.content : allContent;
                }
            }

            if (matchIndex !== -1) {
                matched = true;
                const matchedPattern = responseMatches[matchIndex];
                console.log('Match found:', {
                    matchedPattern,
                    matchIndex,
                    messageCount: pending.accumulator.length
                });

                handleMessageResponse(messageId, {
                    status: 'success',
                    message: 'Found matching response',
                    response: {
                        text: matchedContent,
                        author: message.author,
                        matched: matchedPattern,
                        matchIndex: matchIndex,
                        thumbnailUrl: embedThumbnailUrl
                    }
                });
                return;
            }
        }

        // If no match was found, set/reset the accumulation timer
        if (!matched) {
            console.log('Setting/resetting accumulation timer for', messageId);
            pending.accumulationTimeout = setTimeout(() => {
                // Only process timeout if message is still pending
                if (pendingMessages.has(messageId)) {
                    // Check if we've received any messages in the last 5 seconds
                    const now = Date.now();
                    const lastMessageTime = Math.max(...pending.accumulator.map(m => m.timestamp));
                    const timeSinceLastMessage = now - lastMessageTime;

                    if (timeSinceLastMessage < 4900) { // slightly less than 5s to account for processing time
                        // We received a message recently, reset the timer
                        console.log('Recent message detected, resetting timer:', {
                            messageId,
                            timeSinceLastMessage,
                            accumulatedMessages: pending.accumulator.length
                        });
                        clearTimeout(pending.accumulationTimeout);
                        pending.accumulationTimeout = setTimeout(arguments.callee, 5000);
                        return;
                    }

                    const allContent = pending.accumulator.map(m => m.content).join('\n');
                    console.log('Accumulation timeout reached:', {
                        messageId,
                        accumulatedMessages: pending.accumulator.length,
                        hasMatchPatterns: responseMatches.length > 0,
                        timeSinceLastMessage
                    });
                    
                    if (!responseMatches.length) {
                        handleMessageResponse(messageId, {
                            status: 'success',
                            message: 'Accumulated bot responses',
                            response: {
                                text: allContent,
                                author: message.author,
                                matched: null,
                                matchIndex: -1,
                                thumbnailUrl: embedThumbnailUrl
                            }
                        });
                    } else {
                        handleMessageResponse(messageId, {
                            status: 'error',
                            message: `No matching response found. Looking for: ${responseMatches.join(', ')}`,
                            response: {
                                text: allContent,
                                author: message.author,
                                matched: null,
                                matchIndex: -1,
                                thumbnailUrl: embedThumbnailUrl
                            }
                        });
                    }
                }
            }, 5000); // 5 second window that resets with each new message
        }
    }
}

function logPendingMessages() {
    console.log('\nCurrent pending messages:', {
        count: pendingMessages.size,
        ids: Array.from(pendingMessages.keys())
    });
}

//setInterval(logPendingMessages, 5000);

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
