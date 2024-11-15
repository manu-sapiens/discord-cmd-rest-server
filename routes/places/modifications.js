// routes/places/modifications.js
// --------------------------------
const express = require('express');
const router = express.Router();
// --------------------------------
const Modification = require('../../models/modification');
// --------------------------------

router.get('/', (req, res) => {
  const { party_id } = req.query;

  if (!party_id) {
    return res.status(400).json({ error: 'party_id is required' });
  }

  try {
    const modifications = new Modification(party_id).getModifications();
    res.json({ modifications });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  const { party_id, action, details } = req.body;

  if (!party_id || !action) {
    return res.status(400).json({ error: 'party_id and action are required' });
  }

  try {
    const modification = new Modification(party_id);
    modification.addModification(action, details);
    res.status(201).json({ message: 'Modification added' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
