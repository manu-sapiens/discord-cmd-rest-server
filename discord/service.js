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
    }

    async start() {
        await this.bot.start();
    }

    async sendMessage(message) {
        return this.bot.sendMessage(null, message);
    }
}

// Singleton instance
let instance = null;

async function initialize(token) {
    if (!instance) {
        instance = new DiscordService(token);
        await instance.start();
    }
    return instance;
}

function getInstance() {
    if (!instance) {
        throw new Error('Discord service not initialized');
    }
    return instance;
}

module.exports = {
    initialize,
    getInstance
};
