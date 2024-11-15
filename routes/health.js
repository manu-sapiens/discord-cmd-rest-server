// routes/health.js
// --------------------------------
const express = require('express');
// --------------------------------

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(), // Server uptime in seconds
    // You can add more diagnostics here if needed
  });
});

module.exports = router;
