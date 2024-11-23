// routes/discord/command.js
// --------------------------------
const express = require('express');
// --------------------------------
const commandProcessor = require('../../utils/commandProcessor');
const { getAutomationStarted } = require('../../state');
const { getInstance: getDiscordService } = require('../../discord/service');
const logManager = require('../../log_manager');
// --------------------------------

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, patterns } = req.body;

  if (!getAutomationStarted()) {
    return res.status(400).send("[send-command][400] Automation not started. Please start automation via the Menu.");
  }

  if (!message) {
    return res.status(400).send("[send-command][400] Message is required.");
  }

  try {
    console.log("=================== [send-command] ===================");
    console.log(`[send-command] req = ${JSON.stringify(req.body)}`);
        
    // Get the singleton Discord service instance
    const discordService = getDiscordService();
    
    // Ensure command processor has the Discord service
    commandProcessor.setDiscordService(discordService);
    
    // Get channel info including pinned message and usernames
    const channelInfo = await discordService.bot.getActiveChannelInfo();
    const { botName: botUsername, humanUsername } = channelInfo;
    
    console.log(`[send-command] Processing command: ${message}, botUsername: ${botUsername}, humanUsername: ${humanUsername}`);
        
    const response = await commandProcessor.processCommand(
      message, 
      botUsername, 
      humanUsername, 
      patterns,
      channelInfo.pinnedMessage // Pass pinned message to command processor
    );
    console.log(`[send-command] Response: ${JSON.stringify(response)}`);

    // Log the interaction
    await logManager.logInteraction(
      message,
      patterns || [],
      response
    );

    res.status(200).json(response);
  } 
  catch (error) 
  {
    console.error("Error processing command:", error);
    
    // Handle timeout responses (which come as rejection objects)
    const errorResponse = error.status ? error : { 
      status: 'error',
      error: error.message || 'Unknown error',
      elapsedTime: Date.now() - Date.now(), // fallback elapsed time
      contents: [],
      messages: []
    };

    // Log errors with the full error response
    try {
      await logManager.logInteraction(
        message,
        patterns || [],
        errorResponse
      );
    } catch (logError) {
      console.error("Error logging command error:", logError);
    }

    // Send error response with appropriate status code
    if (error.status === 'error' && error.error === 'No response from bot') {
      res.status(408).json(errorResponse); // Request Timeout
    } else if (error.status === 'error' && error.error === 'No pattern match found') {
      res.status(404).json(errorResponse); // Not Found
    } else {
      res.status(500).json(errorResponse); // Internal Server Error
    }
  }
});

module.exports = router;
