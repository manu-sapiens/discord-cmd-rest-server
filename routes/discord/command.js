// routes/discord/command.js
// --------------------------------
const express = require('express');
// --------------------------------
const commandProcessor = require('../../utils/commandProcessor');
const { getAutomationStarted } = require('../../state');
const { getInstance: getDiscordService } = require('../../discord/service');
// --------------------------------

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, botUsername, humanUsername, patterns } = req.body;

  if (!getAutomationStarted()) {
    return res.status(400).send("[send-command][400] Automation not started. Please start automation via the Menu.");
  }

  if (!message || !botUsername || !humanUsername) {
    return res.status(400).send("[send-command][400] Message, botUsername, and humanUsername are required.");
  }

  try {
    console.log("=================== [send-command] ===================");
    console.log(`[send-command] req = ${JSON.stringify(req.body)}`);
    console.log(`[send-command] Processing command: ${message}, botUsername: ${botUsername}, humanUsername: ${humanUsername}`);
    
    // Get the singleton Discord service instance
    const discordService = getDiscordService();
    
    // Ensure command processor has the Discord service
    commandProcessor.setDiscordService(discordService);
    
    const response = await commandProcessor.processCommand(message, botUsername, humanUsername, patterns);
    console.log(`[send-command] Response: ${JSON.stringify(response)}`);
    res.json({ response });
  } catch (error) {
    console.error("Error processing command:", error);
    res.status(500).send(`[send-command][500] Failed to process command: ${error}`);
  }
});

module.exports = router;
