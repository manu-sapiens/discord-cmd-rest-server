const { Client, Events, GatewayIntentBits, ChannelType } = require('discord.js');
const { EventEmitter } = require('events');

class DiscordBot extends EventEmitter {
    constructor(token) {
        super();
        console.log('Initializing Discord bot...');
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ]
        });
        this.token = token;
        this.activeChannelId = null;
        this.activeChannel = null;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        console.log('Setting up Discord bot event handlers...');

        this.client.on(Events.ClientReady, () => {
            console.log(`Discord bot ready! Logged in as ${this.client.user.tag}`);
            // Log the servers the bot is in
            console.log('Connected to servers:', 
                Array.from(this.client.guilds.cache.values())
                    .map(guild => `${guild.name} (${guild.id})`));
            this.emit('ready');
        });

        // Process raw message events for better control
        this.client.on('raw', (event) => {
            if (event.t === 'MESSAGE_CREATE') {
                const data = event.d;
                
                // Log raw event
                console.log('Raw MESSAGE_CREATE event received:', {
                    content: data.content,
                    author: data.author.username,
                    channelId: data.channel_id
                });

                // Ignore messages from our own bot to prevent loops
                if (data.author.id === this.client.user.id) {
                    return;
                }

                // Get channel type (DM = 1, Guild Text = 0)
                const isDM = data.channel_type === 1;

                if (process.env.DEBUG) {
                    console.log('Processing message:', {
                        content: data.content,
                        author: data.author.username,
                        channelId: data.channel_id,
                        isBot: data.author.bot,
                        channelType: data.channel_type,
                        isDM: isDM
                    });
                }

                // Emit message event for other handlers
                this.emit('message', {
                    content: data.content,
                    author: `${data.author.username}#${data.author.discriminator}`,
                    channelId: data.channel_id,
                    isBot: data.author.bot,
                    isDM: isDM,
                    isActiveChannel: data.channel_id === this.activeChannelId
                });
            }
        });

        // Keep MessageCreate for initialization command only
        this.client.on(Events.MessageCreate, async (message) => {
            // Only handle $start command here
            if (message.content.trim() === '$start') {
                this.activeChannelId = message.channelId;
                this.activeChannel = message.channel;
                this.emit('channelInitialized', {
                    channelId: message.channelId,
                    channelName: message.channel.name,
                    channelType: message.channel.type,
                    guildId: message.guild?.id,
                    guildName: message.guild?.name,
                    botId: this.client.user.id,
                    botName: this.client.user.tag
                });
                await message.reply('Discord automation initialized in this channel.');
            }
        });

        this.client.on(Events.Error, (error) => {
            console.error('Discord client error:', error);
            this.emit('error', error);
        });

        // Add debug event handler
        this.client.on('debug', (info) => {
            console.log('Discord Debug:', info);
        });
    }

    getActiveChannel() {
        return this.activeChannelId;
    }

    getActiveChannelInfo() {
        return {
            channelId: this.activeChannelId,
            channelName: this.activeChannel?.name,
            channelType: this.activeChannel?.type,
            guildId: this.activeChannel?.guild?.id,
            guildName: this.activeChannel?.guild?.name,
            botId: this.client.user.id,
            botName: this.client.user.tag
        };
    }

    async start() {
        console.log('Starting Discord bot...');
        try {
            await this.client.login(this.token);
            console.log('Discord bot login successful');
        } catch (error) {
            console.error('Failed to start Discord bot:', error);
            throw error;
        }
    }

    async stop() {
        console.log('Stopping Discord bot...');
        this.activeChannelId = null;
        this.activeChannel = null;
        if (this.client) {
            await this.client.destroy();
            console.log('Discord bot stopped');
        }
    }

    async sendMessage(channelId, content) {
        try {
            // Default to active channel if no channelId provided
            const targetChannelId = channelId || this.activeChannelId;
            console.log(`Attempting to send message to channel ${targetChannelId}:`, content);

            if (!targetChannelId) {
                throw new Error('No active channel set. Use $start in a channel first.');
            }

            const channel = await this.client.channels.fetch(targetChannelId);
            if (!channel) {
                throw new Error(`Channel ${targetChannelId} not found`);
            }
            const sent = await channel.send(content);
            console.log('Message sent successfully');
            return sent;
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }
}

module.exports = DiscordBot;
