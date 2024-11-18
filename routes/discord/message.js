// routes/discord/message.js
// --------------------------------
const express = require('express');
require('dotenv').config();
// --------------------------------
const queueProcessor = require('../../utils/queueProcessor');
const { getAutomationStarted, setAutomationStarted } = require('../../state');
const DiscordService = require('../../discord/service');
// --------------------------------

const router = express.Router();
let discordService = null;

// Initialize Discord bot
const initializeDiscordBot = async () => {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    
    if (!botToken || botToken === 'your_bot_token_here') {
      throw new Error('Discord bot token not configured. Please set DISCORD_BOT_TOKEN in .env file.');
    }

    if (!discordService) {
      console.log('Initializing Discord bot service...');
      discordService = new DiscordService(botToken);
      
      // Listen for channel initialization
      discordService.on('channelInitialized', (channelInfo) => {
        console.log(`Discord automation initialized in channel ${channelInfo.channelName}`);
        setAutomationStarted(true);
      });

      // Listen for messages and forward to queue processor
      discordService.on('message', (message) => {
        console.log('Message router: Forwarding Discord message to queue processor');
        queueProcessor.handleDiscordMessage(message);
      });

      await discordService.start();
      console.log('Discord bot service initialized successfully');
    }

    return discordService;
  } catch (error) {
    console.error('Failed to initialize Discord bot:', error);
    throw error;
  }
};

router.get('/info', async (req, res) => {
  try {
    if (!discordService) {
      return res.status(400).json({ 
        error: 'Discord bot not initialized',
        status: 'error'
      });
    }

    const info = discordService.getActiveChannelInfo();
    if (!info) {
      return res.status(400).json({ 
        error: 'No active channel. Use $start in a Discord channel first.',
        status: 'error'
      });
    }

    res.json({
      status: 'success',
      info
    });
  } catch (error) {
    console.error('Error getting channel info:', error);
    res.status(500).json({ 
      error: error.message,
      status: 'error'
    });
  }
});

router.post('/', async (req, res) => {
  const { message, useBot = false, botUsername, humanUsername, options } = req.body;

  if (!getAutomationStarted()) {
    return res.status(400).json({
      error: "Automation not started. Please use $start in your target Discord channel.",
      status: 'error'
    });
  }

  if (!message) {
    return res.status(400).json({
      error: `Message is required. Received: ${JSON.stringify(req.body)}`,
      status: 'error'
    });
  }

  // Default options
  const defaultOptions = {
    expectBotResponse: true,
    expectEcho: true,
    responseMatch: null, // New option for substring matching
    timeout: 5000 // Default 5s timeout
  };

  // Merge provided options with defaults
  const messageOptions = { ...defaultOptions, ...options };

  try {
    if (useBot) {
      // Use Discord bot - it will automatically use the active channel
      if (!discordService) {
        return res.status(400).json({
          error: 'Discord bot not initialized.',
          status: 'error'
        });
      }
      await discordService.sendMessage(message);
      res.json({ status: 'Message sent successfully via bot' });
    } else {
      // Use Electron automation for bot commands
      if (!req.body.humanUsername) {
        return res.status(400).json({
          error: 'humanUsername is required for automation',
          status: 'error'
        });
      }
      const result = await queueProcessor.enqueueMessage({
        messageText: message,
        botUsername,
        humanUsername,
        options: messageOptions
      });
      res.json({ result });
    }
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      error: error.message,
      status: 'error'
    });
  }
});

// Initialize bot on module load
(async () => {
  try {
    await initializeDiscordBot();
  } catch (error) {
    console.error('Failed to initialize Discord bot. Exiting application.');
    process.exit(1);
  }
})();

module.exports = router;
