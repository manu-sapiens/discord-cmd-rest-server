// routes/discord/image.js
const express = require('express');
const router = express.Router();
const { updateOtherImage, clearGallery } = require('../../utils/imageViewerManager');

/**
 * POST /discord/image
 * Updates the image viewer window with a new non-map image URL
 */
router.post('/', async (req, res) => {
    try {
        const { imageUrl, metadata = {} } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: 'imageUrl is required' });
        }

        updateOtherImage(imageUrl, metadata);
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /discord/image
 * Clears all images from the gallery
 */
router.delete('/', async (req, res) => {
    try {
        clearGallery();
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Error clearing gallery:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
