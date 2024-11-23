// routes/discord/map.js
const express = require('express');
const router = express.Router();
const { updateMap } = require('../../utils/imageViewerManager');

/**
 * POST /discord/map
 * Updates the map viewer window with a new image URL
 */
router.post('/', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: 'imageUrl is required' });
        }

        updateMap(imageUrl);
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error updating map:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
