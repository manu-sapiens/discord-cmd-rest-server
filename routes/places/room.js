// routes/places/room.js
// --------------------------------
const express = require('express');
const router = express.Router();
// --------------------------------
const Dungeon = require('../../models/dungeon');
const Modification = require('../../models/modification');
// --------------------------------

router.get('/:roomId', (req, res) => {
    
  const { roomId } = req.params;
  const { party_id } = req.query;

  console.log("roomId: ", roomId);  
  console.log("party_id: ", party_id);

  if (!party_id) {
    return res.status(400).json({ error: 'party_id is required' });
  }

  try {
    const dungeon = new Dungeon('dungeon1'); // Replace with dynamic dungeon ID if needed
    console.log("dungeon: ", dungeon);

    const modifications = new Modification(party_id).getModifications();
    console.log("modifications: ", modifications);

    dungeon.applyModifications(modifications);
    console.log("dungeon*: ", dungeon);

    const room = dungeon.getRoom(roomId);
    console.log("room: ", room);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
