// routes/command.js
// --------------------------------
const express = require('express');
// --------------------------------
const { enqueueMessage } = require('../../utils/queueProcessor'); // Enqueue helper
const { getAutomationStarted } = require('../../state');
// --------------------------------

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, botUsername, humanUsername, commandPrefix = '!' } = req.body;

  if (!getAutomationStarted) {
    return res.status(400).send("[send-command][400] Automation not started. Please start automation via the Menu.");
  }

  if (!message || !botUsername || !humanUsername) {
    return res.status(400).send("[send-command][400] Message, botUsername, and humanUsername are required.");
  }

  // Ensure the message starts with the command prefix
  let commandMessage = message.startsWith(commandPrefix) ? message : commandPrefix + message;

  // Enqueue the command and expect a bot response
  try {
    const response = await enqueueMessage(commandMessage, botUsername, humanUsername, { expectBotResponse: true, expectEcho: false });
    res.json({ response });
  } catch (error) {
    console.error("Error sending command:", error);
    res.status(500).send(`[send-command][500] Failed to send command: ${error}`);
  }
});

module.exports = router;
