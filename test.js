const fetch = require('node-fetch');

const payload = {
  message: "!character",
  botUsername: "AVRAE_NotebookDnD",
  humanUsername: "manu_mercs",
};

fetch('http://localhost:3000/send-message', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
  .then(response => response.json())
  .then(data => console.log("Bot's response:", data.response))
  .catch(error => console.error('Error:', error));
