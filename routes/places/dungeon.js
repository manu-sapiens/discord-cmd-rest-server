// ./routes/places/dungeon.js
// --------------------------------
const express = require('express');
const router = express.Router();
// --------------------------------
const Dungeon = require('../../models/dungeon');
// --------------------------------

router.get('/', (req, res) => {
  const { dungeon_id } = req.query;

  if (!dungeon_id) {
    return res.status(400).json({ error: 'dungeon_id is required' });
  }

  try {
    const dungeon = new Dungeon(dungeon_id);
    const dungeonInfo = dungeon.getDungeonInfo();

    res.json({ dungeon: dungeonInfo });
  } catch (e) {
    console.error(`Error fetching dungeon data: ${e.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
