const express = require('express');
const bodyParser = require('body-parser');
const { initialize: initializeDiscordService } = require('./discord/service');
require('dotenv').config();

// Initialize Express server
const PORT = process.env.DISCORD_AUTOMATION_SERVER_PORT || 3037;
const server = express();
server.use(bodyParser.json());
server.use(express.json());

// Initialize Discord Service
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken || botToken === 'your_bot_token_here') {
    console.error('Discord bot token not configured. Please set DISCORD_BOT_TOKEN in .env file.');
    process.exit(1);
}

console.log('Initializing Discord service...');
initializeDiscordService(botToken).catch(error => {
    console.error('Failed to initialize Discord service:', error);
    process.exit(1);
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
