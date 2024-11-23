// routes/discord/message.js
const express = require('express');
require('dotenv').config();
const { getAutomationStarted } = require('../../state');
const { getInstance: getDiscordService } = require('../../discord/service');

const router = express.Router();

router.get('/info', async (req, res) => {
  try {
    const discordService = getDiscordService();
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
  const { message } = req.body;

  if (!getAutomationStarted()) {
    return res.status(400).json({
      status: 'error',
      error: "Automation not started. Please use $start in your target Discord channel."
    });
  }

  if (!message) {
    return res.status(400).json({
      status: 'error',
      error: `Message is required. Received: ${JSON.stringify(req.body)}`
    });
  }

  try 
  {
    const discordService = getDiscordService();
    const startTime = Date.now();
    await discordService.sendMessage(message);
    res.status(200).json({
      status: 'success',
      elapsedTime: Date.now() - startTime
    });
  }
  catch (error) 
  {
    console.error("Error sending message:", error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
