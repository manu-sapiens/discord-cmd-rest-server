const DiscordBot = require('./bot');
const { EventEmitter } = require('events');

class DiscordService extends EventEmitter {
    constructor(token) {
        super();
        console.log('Initializing Discord service...');
        if (!token) {
            throw new Error('Discord bot token is required');
        }
        this.bot = new DiscordBot(token);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        console.log('Setting up Discord service event handlers...');

        this.bot.on('channelInitialized', (channelInfo) => {
            console.log('Discord service: Channel initialized event received');
            console.log(`Channel: ${channelInfo.channelName} (${channelInfo.channelId})`);
            console.log(`Server: ${channelInfo.guildName} (${channelInfo.guildId})`);
            this.emit('channelInitialized', channelInfo);
        });

        this.bot.on('message', (message) => {
            console.log('Discord service: Message event received:', message);
            this.emit('message', message);
        });

        this.bot.on('error', (error) => {
            console.error('Discord service: Error event received:', error);
            this.emit('error', error);
        });

        this.bot.on('ready', () => {
            console.log('Discord service: Bot ready event received');
        });
    }

    getActiveChannel() {
        const channelId = this.bot.getActiveChannel();
        console.log('Discord service: Getting active channel:', channelId);
        return channelId;
    }

    getActiveChannelInfo() {
        console.log('Discord service: Getting active channel info');
        return this.bot.getActiveChannelInfo();
    }

    async start() {
        console.log('Discord service: Starting bot...');
        await this.bot.start();
        console.log('Discord service: Bot started successfully');
    }

    async stop() {
        console.log('Discord service: Stopping bot...');
        await this.bot.stop();
        console.log('Discord service: Bot stopped successfully');
    }

    async sendMessage(content, channelId = null) {
        console.log(`Discord service: Sending message to channel ${channelId || 'active'}:`, content);
        return await this.bot.sendMessage(channelId, content);
    }
}

module.exports = DiscordService;
