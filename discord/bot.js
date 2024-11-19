const { Client, Events, GatewayIntentBits, ChannelType, Partials } = require('discord.js');
const { EventEmitter } = require('events');
const { setAutomationStarted } = require('../state');

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
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.DirectMessageReactions
            ],
            partials: [
                Partials.Message,
                Partials.Channel,
                Partials.Reaction
            ]
        });
        this.token = token;
        this.activeChannelId = null;
        this.activeChannel = null;

        // Track DM channels
        this.dmChannels = new Set();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        console.log('Setting up Discord bot event handlers...');

        // Handle message events
        this.client.on('messageCreate', async message => {
            // Log incoming message
            console.log('MessageCreate event:', {
                content: message.content,
                channelType: message.channel.type,
                channelId: message.channelId,
                author: message.author.username,
                isDM: message.channel.type === ChannelType.DM,
                guildId: message.guildId
            });

            // Ignore messages from our own bot to prevent loops
            if (message.author.id === this.client.user.id) {
                return;
            }

            const isFromActiveChannel = message.channelId === this.activeChannelId;
            const isDM = message.channel.type === ChannelType.DM;
            const isFromAvrae = message.author.username === 'Avrae';

            // If it's a DM from Avrae, store the channel ID
            if (isDM && isFromAvrae) {
                this.dmChannels.add(message.channelId);
            }

            // Debug log for message filtering
            console.log('Message filter check:', {
                isDM,
                isFromActiveChannel,
                isFromAvrae,
                willAccept: isFromActiveChannel || (isDM && isFromAvrae)
            });

            // Accept messages if they're either:
            // 1. From the active channel, or
            // 2. DMs from Avrae
            if (isFromActiveChannel || (isDM && isFromAvrae)) {
                this.emit('message', {
                    content: message.content,
                    author: message.author.username,
                    discriminator: message.author.tag,
                    channelId: message.channelId,
                    isBot: message.author.bot,
                    isDM: isDM,
                    isActiveChannel: isFromActiveChannel,
                    embeds: message.embeds
                });
            }

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
                setAutomationStarted(true);
                await message.reply('Discord automation initialized in this channel.');
            }
        });

        this.client.on(Events.ClientReady, () => {
            console.log(`Discord bot ready! Logged in as ${this.client.user.tag}`);
            // Log the servers the bot is in
            console.log('Connected to servers:', 
                Array.from(this.client.guilds.cache.values())
                    .map(guild => `${guild.name} (${guild.id})`));
            
            // Debug: Log all available channels
            console.log('Available channels:', 
                Array.from(this.client.channels.cache.values())
                    .map(channel => ({
                        name: channel.name,
                        id: channel.id,
                        type: channel.type,
                        isDM: channel.type === ChannelType.DM
                    }))
            );
            
            this.emit('ready');
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
