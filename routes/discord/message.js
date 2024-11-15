// routes/message.js
// --------------------------------
const express = require('express');
// --------------------------------
const { enqueueMessage } = require('../../utils/queueProcessor'); // Helper for enqueueing
const { getAutomationStarted } = require('../../state');
// --------------------------------

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, humanUsername } = req.body;

  if (!getAutomationStarted()) {
    return res.status(400).send("[send-message][400] Automation not started. Please start automation via the Menu.");
  }

  if (!message || !humanUsername) {
    return res.status(400).send(`[send-message][400] Message and humanUsername are required. Received: ${JSON.stringify(req.body)}`);
  }

  try {
    const response = await enqueueMessage(message, null, humanUsername, { expectBotResponse: false, expectEcho: true });
    res.json({ response });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).send(`[send-message][500] Failed to send message: ${error}`);
  }
});

module.exports = router;
