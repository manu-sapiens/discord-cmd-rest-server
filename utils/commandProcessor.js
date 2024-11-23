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

    async processCommand(messageText, botUsername, humanUsername, patterns = [], pinnedMessage = null) {
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
        this.pinnedMessage = pinnedMessage; // Store pinned message
        
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
                    contents: this.accumulatedMessages,
                    messages: this.accumulatedMessages.map(m => ({
                        text: m.text,
                        embeds: m.embeds || []
                    })),
                    map_urls: [],
                    image_urls: []
                });
                this.resetState();
            }, INITIAL_TIMEOUT);

            this.state = STATES.PROCESSING;
        });
    }

    handleDiscordMessage(message) {
        if (this.state !== STATES.PROCESSING) {
            return;
        }

        // Track seen messages to prevent duplicates
        const messageKey = `${message.author}-${message.content}-${JSON.stringify(message.embeds)}`;
        if (this.seenMessages && this.seenMessages.has(messageKey)) {
            return;
        }

        console.log('Processing Discord message:', message);
            
        const isBotUser = message.author === this.botUsername;
        const originalMessage = message.content.trim();
        const simplifiedMessage = originalMessage.toLowerCase();

        if (isBotUser) {
            // Add message to seen set
            if (!this.seenMessages) {
                this.seenMessages = new Set();
            }
            this.seenMessages.add(messageKey);

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
                embeds: message.embeds || [],
                pinnedMessage: this.pinnedMessage // Include pinned message in accumulated messages
            });

            // Check for pattern matches if we have patterns
            if (this.patterns && this.patterns.length > 0) {
                // Look for pattern matches
                for (let i = 0; i < this.patterns.length; i++) {
                    const pattern = this.patterns[i];
                    const normalized = pattern.trim().toLowerCase();
                    
                    // 1. First check message content
                    if (simplifiedMessage.includes(normalized)) {
                        const origin  = `\nMatched pattern: ${pattern} with message: ${originalMessage}`
                        const success_result = {
                            status: 'success',
                            elapsedTime: Date.now() - this.startTime,
                            match: pattern,
                            text: originalMessage,
                            embeds: message.embeds || [],            
                            contents: this.accumulatedMessages,
                            messages: this.accumulatedMessages.map(m => ({
                                text: m.text,
                                embeds: m.embeds || []
                            })),
                            origin: origin,
                            matched_on: 'text',
                            map_urls: [],
                            image_urls: []
                        }
                        console.log(origin);
                        console.log(`\nResponse: ${JSON.stringify(success_result)}`);
                        this.resolveCurrentProcessing(success_result);
                        return;
                    }
                    
                    // 2. Then check embeds
                    if (message.embeds && message.embeds.length > 0) {
                        for (const embed of message.embeds) {
                            const embedText = [
                                embed.author?.name || '',
                                embed.title || '',
                                embed.description || '',
                                ...(embed.fields || []).map(f => `${(f.name || '')} ${(f.value || '')}`),
                                embed.footer?.text || ''
                            ]
                            .filter(text => text)
                            .join(' ')
                            .toLowerCase()
                            .replace(/[^\w\s]/g, '')
                            .replace(/\s+/g, ' ')
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
                                    messages: this.accumulatedMessages.map(m => ({
                                        text: m.text,
                                        embeds: m.embeds || []
                                    })),
                                    origin: origin,
                                    matched_on: 'embed',
                                    map_urls: [],
                                    image_urls: []
                                }
                                console.log(origin);
                                console.log(`\nResponse: ${JSON.stringify(success_result)}`);
                                this.resolveCurrentProcessing(success_result);
                                return;
                            }
                        }
                    }
                    
                    // 3. Finally check pinned message if available
                    if (this.pinnedMessage) {
                        const pinnedText = this.pinnedMessage.content || '';
                        const simplifiedPinned = pinnedText.toLowerCase();
                        
                        if (simplifiedPinned.includes(normalized)) {
                            const origin = `\nMatched pattern: ${pattern} with pinned message: ${pinnedText}`
                            const success_result = {
                                status: 'success',
                                elapsedTime: Date.now() - this.startTime,
                                match: pattern,
                                text: pinnedText,
                                embeds: this.pinnedMessage.embeds || [],
                                contents: this.accumulatedMessages,
                                messages: this.accumulatedMessages.map(m => ({
                                    text: m.text,
                                    embeds: m.embeds || []
                                })),
                                origin: origin,
                                matched_on: 'pinned',
                                map_urls: [],
                                image_urls: []
                            }
                            console.log(origin);
                            console.log(`\nResponse: ${JSON.stringify(success_result)}`);
                            this.resolveCurrentProcessing(success_result);
                            return;
                        }
                    }
                }

                // Set timeout to wait for more messages that might match
                this.accumulationTimeout = setTimeout(() => {
                    this.resolveCurrentProcessing({
                        status: 'error',
                        elapsedTime: Date.now() - this.startTime,
                        error: 'No pattern match found',
                        contents: this.accumulatedMessages,
                        messages: this.accumulatedMessages.map(m => ({
                            text: m.text,
                            embeds: m.embeds || []
                        })),
                        matched_on: 'n/a',
                        map_urls: [],
                        image_urls: []
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
                        messages: this.accumulatedMessages.map(m => ({
                            text: m.text,
                            embeds: m.embeds || []
                        })),
                        origin: origin,
                        matched_on: 'n/a',
                        map_urls: [],
                        image_urls: []
                    }
                    console.log(origin);
                    console.log(`\nResponse: ${JSON.stringify(success_result)}`);

                    this.resolveCurrentProcessing(success_result);
                }, ACCUMULATION_TIMEOUT);
            }
        }
    }

    // Helper to extract and categorize URLs from text
    extractUrls(text) {
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
        const urls = text.match(urlRegex) || [];
        return urls.reduce((acc, url) => {
            // Only otfbm.io URLs are considered maps
            if (url.includes('otfbm.io')) {
                acc.mapUrls.push(url); // Add the battle map URL
                
                // Extract background URL if present
                const bgMatch = url.match(/[?&]bg=(https?:\/\/[^&]+)/);
                if (bgMatch) {
                    const bgUrl = decodeURIComponent(bgMatch[1]);
                    if (bgUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
                        acc.mapUrls.push(bgUrl);
                    }
                }
            }
            // All other image URLs go to imageUrls
            else if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
                acc.imageUrls.push(url);
            }
            return acc;
        }, { mapUrls: [], imageUrls: [] });
    }

    // Helper to extract URLs from embeds
    extractUrlsFromEmbed(embed) {
        const urls = { mapUrls: [], imageUrls: [] };
        
        // Check embed image
        if (embed.image && embed.image.url) {
            const { mapUrls, imageUrls } = this.extractUrls(embed.image.url);
            urls.mapUrls.push(...mapUrls);
            urls.imageUrls.push(...imageUrls);
        }

        // Check embed thumbnail
        if (embed.thumbnail && embed.thumbnail.url) {
            const { mapUrls, imageUrls } = this.extractUrls(embed.thumbnail.url);
            urls.mapUrls.push(...mapUrls);
            urls.imageUrls.push(...imageUrls);
        }

        // Check embed description
        if (embed.description) {
            const { mapUrls, imageUrls } = this.extractUrls(embed.description);
            urls.mapUrls.push(...mapUrls);
            urls.imageUrls.push(...imageUrls);
        }

        // Check for proxy URLs which might be different versions of the same image
        if (embed.image && embed.image.proxy_url) {
            const { mapUrls, imageUrls } = this.extractUrls(embed.image.proxy_url);
            urls.mapUrls.push(...mapUrls);
            urls.imageUrls.push(...imageUrls);
        }
        if (embed.thumbnail && embed.thumbnail.proxy_url) {
            const { mapUrls, imageUrls } = this.extractUrls(embed.thumbnail.proxy_url);
            urls.mapUrls.push(...mapUrls);
            urls.imageUrls.push(...imageUrls);
        }

        return urls;
    }

    // Helper to collect URLs from accumulated messages
    collectUrlsFromMessages() {
        return this.accumulatedMessages.reduce((acc, message) => {
            // Extract from message text
            const textUrls = this.extractUrls(message.text || '');
            acc.mapUrls.push(...textUrls.mapUrls);
            acc.imageUrls.push(...textUrls.imageUrls);

            // Extract from embeds
            if (message.embeds && Array.isArray(message.embeds)) {
                message.embeds.forEach(embed => {
                    const embedUrls = this.extractUrlsFromEmbed(embed);
                    acc.mapUrls.push(...embedUrls.mapUrls);
                    acc.imageUrls.push(...embedUrls.imageUrls);
                });
            }

            return acc;
        }, { mapUrls: [], imageUrls: [] });
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
            // Add collected URLs to the result
            const { mapUrls, imageUrls } = this.collectUrlsFromMessages();
            result.map_urls = [...new Set(mapUrls)]; // Remove duplicates
            result.image_urls = [...new Set(imageUrls)]; // Remove duplicates
            
            this.resolve(result);
            this.resetState();
        }
    }

    resetState() {
        this.state = STATES.IDLE;
        this.messageId = null;
        this.messageText = null;
        this.botUsername = null;
        this.humanUsername = null;
        this.startTime = null;
        this.accumulatedMessages = [];
        this.patterns = null;
        this.gotBotResponse = false;
        this.resolve = null;
        this.reject = null;
        this.initialTimeout = null;
        this.accumulationTimeout = null;
        this.seenMessages = null;
        this.pinnedMessage = null;
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
