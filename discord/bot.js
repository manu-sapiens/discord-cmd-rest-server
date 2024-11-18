const { Client, Events, GatewayIntentBits, ChannelType, Partials } = require('discord.js');
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

        // Debug: Log all raw events with full data for deletes
        this.client.on('raw', event => {
            if (event.t === 'MESSAGE_DELETE') {
                console.log('Message Delete event details:', {
                    id: event.d?.id,
                    channelId: event.d?.channel_id,
                    guildId: event.d?.guild_id,
                    fullData: event.d
                });
            } else {
                console.log('Raw event received:', {
                    type: event.t,
                    channelId: event.d?.channel_id,
                    channelType: event.d?.channel_type,
                    author: event.d?.author?.username
                });
            }
        });

        // Debug: Log all message events
        this.client.on('messageCreate', message => {
            console.log('MessageCreate event:', {
                content: message.content,
                channelType: message.channel.type,
                channelId: message.channelId,
                author: message.author.username,
                isDM: message.channel.type === ChannelType.DM,
                guildId: message.guildId
            });
        });

        // Add specific handler for message delete events
        this.client.on('messageDelete', message => {
            console.log('Message deleted:', {
                content: message.content,
                author: message.author?.username,
                channelId: message.channelId,
                channelType: message.channel.type,
                isDM: message.channel.type === ChannelType.DM,
                wasFromBot: message.author?.bot,
                messageId: message.id
            });
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

        // Process raw message events for better control
        this.client.on('raw', async (event) => {
            if (event.t === 'MESSAGE_CREATE') {
                const data = event.d;
                
                // Get the channel to determine its type
                const channel = await this.client.channels.fetch(data.channel_id).catch(err => {
                    console.error('Error fetching channel:', err);
                    return null;
                });

                if (!channel) {
                    console.log('Could not fetch channel:', data.channel_id);
                    return;
                }

                const isDM = channel.type === ChannelType.DM;
                
                // Log raw event with more details
                console.log('Raw MESSAGE_CREATE event received:', {
                    content: data.content,
                    author: data.author.username,
                    channelId: data.channel_id,
                    channelType: channel.type,
                    isDM: isDM,
                    isFromAvrae: data.author.username === 'Avrae',
                    embeds: data.embeds
                });

                // Ignore messages from our own bot to prevent loops
                if (data.author.id === this.client.user.id) {
                    return;
                }

                const isFromActiveChannel = data.channel_id === this.activeChannelId;
                const isFromAvrae = data.author.username === 'Avrae';

                // If it's a DM from Avrae, store the channel ID
                if (isDM && isFromAvrae) {
                    this.dmChannels.add(data.channel_id);
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
                    // Emit message event with full data
                    this.emit('message', {
                        content: data.content,
                        author: `${data.author.username}#${data.author.discriminator}`,
                        channelId: data.channel_id,
                        isBot: data.author.bot,
                        isDM: isDM,
                        isActiveChannel: isFromActiveChannel,
                        embeds: data.embeds
                    });
                }
            }
        });

        // Handle direct messages specifically
        this.client.on(Events.MessageCreate, message => {
            if (message.channel.type === ChannelType.DM && message.author.username === 'Avrae') {
                console.log('Direct message from Avrae received:', {
                    content: message.content,
                    embeds: message.embeds,
                    channelId: message.channelId
                });
                
                // Emit message event with full data
                this.emit('message', {
                    content: message.content,
                    author: `${message.author.username}#${message.author.discriminator}`,
                    channelId: message.channelId,
                    isBot: message.author.bot,
                    isDM: true,
                    isActiveChannel: false,
                    embeds: message.embeds
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
