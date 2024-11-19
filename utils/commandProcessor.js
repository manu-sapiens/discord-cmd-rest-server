// utils/commandProcessor.js
const { getMainWindow } = require('./windowManager');
const { EventEmitter } = require('events');
const crypto = require('crypto');

// Processing states
const STATES = {
    IDLE: 'idle',
    PROCESSING: 'processing'
};

// Timeout constants
const INITIAL_TIMEOUT = 20000;  // 20 seconds for initial bot response
const ACCUMULATION_TIMEOUT = 5000;  // 5 seconds for accumulating messages

class CommandProcessor extends EventEmitter {
    constructor() {
        super();
        this.setupIpcHandlers();
        this.resetState();
    }

    setupIpcHandlers() {
        const { ipcMain } = require('electron');
        ipcMain.on('message-response', (event, { messageId, response }) => {
            this.emit('message-response', { messageId, response });
        });
    }

    setDiscordService(discordService) {
        this.discordService = discordService;
        this.discordService.on('message', (message) => this.handleDiscordMessage(message));
    }

    async processCommand(messageText, botUsername, humanUsername, patterns = []) {
        if (this.state === STATES.PROCESSING) {
            throw new Error('Already processing a message');
        }

        const messageId = crypto.randomUUID();
        this.messageId = messageId;
        this.messageText = messageText;
        this.botUsername = botUsername;
        this.humanUsername = humanUsername;
        this.startTime = Date.now();
        this.accumulatedMessages = [];
        this.patterns = patterns;
        this.gotBotResponse = false;
        
        console.log('\nProcessing command with:', {
            messageId,
            messageText,
            botUsername,
            humanUsername,
            patterns
        });

        // Extract just the command part before any patterns
        const commandPart = messageText.split('|')[0].trim();

        const message_typed = await this.deliverToRenderer({
            messageId,
            messageText: commandPart,  // Send only the command part
            botUsername,
            humanUsername,
            patterns,
            startTime: this.startTime
        });

        if (!message_typed) {
            throw new Error('Failed to deliver message to renderer');
        }

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;

            // Initial timeout for bot response (20s)
            this.initialTimeout = setTimeout(() => {
                this.reject({
                    status: 'error',
                    elapsedTime: Date.now() - this.startTime,
                    error: 'No response from bot',
                    contents: this.accumulatedMessages
                });
                this.resetState();
            }, INITIAL_TIMEOUT);

            this.state = STATES.PROCESSING;
        });
    }

    handleDiscordMessage(message) {
        if (this.state === STATES.PROCESSING) {
            console.log('Received Discord message while processing:', message);
            
            const isBotUser = message.author === this.botUsername;
            const originalMessage = message.content.trim();
            const simplifiedMessage = originalMessage.toLowerCase();

            if (isBotUser) {
                // Clear initial timeout on first bot response
                if (!this.gotBotResponse) {
                    this.gotBotResponse = true;
                    if (this.initialTimeout) {
                        clearTimeout(this.initialTimeout);
                        this.initialTimeout = null;
                    }
                }

                // Reset accumulation timeout
                if (this.accumulationTimeout) {
                    clearTimeout(this.accumulationTimeout);
                }
                
                // Store message
                this.accumulatedMessages.push({
                    sender: this.botUsername,
                    text: originalMessage,
                    embeds: message.embeds || []
                });

                // Check for pattern matches if we have patterns
                if (this.patterns && this.patterns.length > 0) {
                    // Look for pattern matches
                    for (let i = 0; i < this.patterns.length; i++) {
                        const pattern = this.patterns[i];
                        const normalized = pattern.trim().toLowerCase();
                        
                        // Check message content
                        if (simplifiedMessage.includes(normalized)) {

                            const origin  = `\nMatched pattern: ${pattern} with message: ${originalMessage}`
                            const success_result = {
                                status: 'success',
                                elapsedTime: Date.now() - this.startTime,
                                match: pattern,
                                text: originalMessage,
                                embeds: message.embeds || [],            
                                contents: this.accumulatedMessages,
                                origin: origin
                            }

                            console.log(origin);
                            console.log(`\nResponse: ${JSON.stringify(success_result)}`);

                            this.resolveCurrentProcessing(success_result);
                            return;
                        }
                        
                        // Check embeds
                        if (message.embeds && message.embeds.length > 0) {
                            for (const embed of message.embeds) {
                                const embedText = [
                                    embed.title || '',
                                    embed.description || '',
                                    ...(embed.fields || []).map(f => `${(f.name || '')} ${(f.value || '')}`)
                                ]
                                .filter(text => text) // Remove empty strings
                                .join(' ')
                                .toLowerCase()
                                .replace(/[^\w\s]/g, '') // Remove special characters
                                .replace(/\s+/g, ' ')    // Normalize whitespace
                                .trim();
                                
                                if (embedText.includes(normalized)) {

                                    const origin  = `\nMatched pattern: ${pattern} with embed: ${embedText}`
                                    const success_result = {
                                        status: 'success',
                                        elapsedTime: Date.now() - this.startTime,
                                        match: pattern,
                                        text: embedText,
                                        embeds: [embed],
                                        contents: this.accumulatedMessages,
                                        origin: origin
                                    }

                                    console.log(origin);
                                    console.log(`\nResponse: ${JSON.stringify(success_result)}`);

                                    this.resolveCurrentProcessing(success_result);
                                    return;
                                }
                            }
                        }
                    }

                    // Set timeout to wait for more messages that might match
                    this.accumulationTimeout = setTimeout(() => {
                        this.resolveCurrentProcessing({
                            status: 'error',
                            elapsedTime: Date.now() - this.startTime,
                            error: 'No pattern match found',
                            contents: this.accumulatedMessages
                        });
                    }, ACCUMULATION_TIMEOUT);
                } else {
                    // No patterns to match, resolve after accumulation timeout
                    this.accumulationTimeout = setTimeout(() => {
                        const origin = `\nNo patterns to match, resolving after accumulation timeout`
                        const success_result = {
                            status: 'success',
                            elapsedTime: Date.now() - this.startTime,
                            contents: this.accumulatedMessages,
                            origin: origin
                        }
                        console.log(origin);
                        console.log(`\nResponse: ${JSON.stringify(success_result)}`);

                        this.resolveCurrentProcessing(success_result);
                    }, ACCUMULATION_TIMEOUT);
                }
            }
        }
    }

    resolveCurrentProcessing(result) {
        if (this.accumulationTimeout) {
            clearTimeout(this.accumulationTimeout);
            this.accumulationTimeout = null;
        }
        if (this.initialTimeout) {
            clearTimeout(this.initialTimeout);
            this.initialTimeout = null;
        }
        if (this.resolve) {
            this.resolve(result);
        }
        this.resetState();
    }

    resetState() {
        this.state = STATES.IDLE;
        this.messageId = null;
        this.messageText = null;
        this.botUsername = null;
        this.humanUsername = null;
        this.patterns = [];
        this.startTime = null;
        this.accumulatedMessages = [];
        this.gotBotResponse = false;
        this.resolve = null;
        this.reject = null;
        if (this.initialTimeout) {
            clearTimeout(this.initialTimeout);
            this.initialTimeout = null;
        }
        if (this.accumulationTimeout) {
            clearTimeout(this.accumulationTimeout);
            this.accumulationTimeout = null;
        }
    }

    async deliverToRenderer(message) {
        const mainWindow = getMainWindow();
        if (!mainWindow) {
            console.error('Main window not found');
            return false;
        }
        mainWindow.webContents.send('send-message-to-renderer', message);
        return true;
    }
}

// Export a singleton instance
const commandProcessor = new CommandProcessor();
module.exports = commandProcessor;
