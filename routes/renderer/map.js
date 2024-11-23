const express = require('express');
const router = express.Router();

/**
 * POST /renderer/map
 * Renders a map image in a window
 */
router.post('/', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ error: 'imageUrl is required' });
        }

        // Send HTML with the image embedded
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Map Renderer</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: #000;
                    }
                    img {
                        max-width: 100%;
                        max-height: 100vh;
                        object-fit: contain;
                    }
                </style>
            </head>
            <body>
                <img src="${imageUrl}" alt="Map" />
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error in map renderer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
