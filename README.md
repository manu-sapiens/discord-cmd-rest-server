# DISCORD Automation + Dungeon REST Server
A Node.js REST server that provides information about D&D dungeons. The server loads dungeon data from YAML files, tracks modifications per party, and serves dungeon, room, and modification data through RESTful API endpoints.

# Table of Contents
Features
Prerequisites
Installation
Project Structure
Usage
Starting the Server
API Endpoints
Health Check
Get Dungeon Information
Get Room Information
Get Modifications
Add a Modification
Data Format
Dungeon YAML Files
Modifications JSON Files
Example Requests
Interacting with the Server Using Python

# Features
Loads immutable dungeon data from YAML files.
Tracks modifications (e.g., revealing secret doors, monster status) per party in JSON files.
Provides RESTful API endpoints to retrieve dungeon, room, and modification data.
Applies modifications in order to reflect the current state of the dungeon.
Prepares for future blockchain integration by including hashes in modifications.
Health check endpoint for monitoring server status.
Easy to share dungeon definitions by zipping the data files.

# Prerequisites
Node.js version 12 or higher
npm (Node Package Manager)
Python (optional, for interacting with the server using Python scripts)
curl or an API client like Postman for testing endpoints

# Project Structure

data/: Contains dungeon YAML files and modifications JSON files.
routes/: Contains route handlers for the API endpoints.
models/: Contains the models for Dungeon and Modification.

## Usage

# Starting the Server
Ensure you are in the dungeon-rest-server directory and run:

node src/app.js

The server will start on port 3037 by default.

## API Endpoints

# Health Check
Endpoint: GET /health

Description: Returns the health status of the server.

Response:
{
  "status": "UP",
  "timestamp": "2023-10-15T12:34:56.789Z",
  "uptime": 1234.56
}

# Get Dungeon Information
Endpoint: GET /dungeon

Query Parameters:

dungeon_id (required): The ID of the dungeon to retrieve.
Description: Retrieves information about a specific dungeon.

Response:

{
  "dungeon": {
    "dungeon_id": "dungeon1",
    "name": "Goblin Caves",
    "level_min": 1,
    "level_max": 4,
    "recommended_party_size": 4,
    "description": "A classic dungeon crawl...",
    "adventure_hook": "The villagers have hired the party...",
    "rumors": [
      "The goblins have been raiding the village at night.",
      "The goblins are led by a powerful shaman named Yart.",
      "The goblins have been stealing food and supplies."
    ]
  }
}

# Get Room Information
Endpoint: GET /rooms/:roomId

Query Parameters:

party_id (required): The ID of the party.
dungeon_id (required): The ID of the dungeon.
Description: Retrieves information about a specific room, including applied modifications.

Response:

{
  "room": {
    "room_id": "room2",
    "name": "Guard Room",
    "size": [15, 15],
    "description": "A room with goblin guards.",
    "connections": [
      {
        "to": "room1",
        "type": "door"
      },
      {
        "to": "room3",
        "type": "secret_door",
        "secret_door_id": "secret1",
        "revealed": true
      }
    ],
    "monsters": [
      "goblin",
      "goblin",
      {
        "id": "yart_the_goblin_shaman",
        "status": "wounded"
      }
    ]
  }
}

# Get Modifications
Endpoint: GET /modifications

Query Parameters:

party_id (required): The ID of the party.
dungeon_id (required): The ID of the dungeon.
Description: Retrieves all modifications for a specific party and dungeon.

Response:

{
  "modifications": [
    {
      "modification_id": "mod1",
      "party_id": "party1",
      "timestamp": "2023-10-01T10:00:00Z",
      "previous_hash": "0",
      "action": "secret_door_revealed",
      "details": {
        "secret_door_id": "secret1"
      },
      "hash": "6a9f78c..."
    },
    // More modifications...
  ]
}

# Add a Modification
Endpoint: POST /modifications

Headers:

Content-Type: application/json
Body Parameters:

party_id (required): The ID of the party.
dungeon_id (required): The ID of the dungeon.
action (required): The action to perform (e.g., secret_door_revealed).
details (optional): Additional details required for the action.
Description: Adds a new modification for a party.

Response:

{
  "message": "Modification added"
}
Data Format
Dungeon YAML Files
Dungeon data is stored in YAML files under data/dungeons/.

Example dungeon1.yaml:

dungeon_id: dungeon1
name: "Goblin Caves"
level_min: 1
level_max: 4
recommended_party_size: 4
description: "A classic dungeon crawl through a cave system inhabited by goblins."
adventure_hook: "The villagers have hired the party to deal with goblins that have been raiding the village of Stony Brook..."
rumors:
  - "The goblins have been raiding the village at night."
  - "The goblins are led by a powerful shaman named Yart."
  - "The goblins have been stealing food and supplies."
rooms:
  - room_id: room1
    name: "Entrance"
    size: [10, 10]
    description: "A dark cave entrance."
    connections:
      - to: room2
        type: "door"
    monsters:
      - goblin
  - room_id: room2
    name: "Guard Room"
    size: [15, 15]
    description: "A room with goblin guards."
    connections:
      - to: room1
        type: "door"
      - to: room3
        type: "secret_door"
        secret_door_id: secret1
    monsters:
      - goblin
      - goblin
      - yart_the_goblin_shaman
loot:
  - loot_id: loot1
    room_id: room2
    description: "A chest filled with gold."

# Modifications JSON Files
Modifications are stored per party and dungeon in JSON files under data/modifications/.

Filename Format:

{party_id}_{dungeon_id}_modifications.json
Example party1_dungeon1_modifications.json:

[
  {
    "modification_id": "mod1",
    "party_id": "party1",
    "timestamp": "2023-10-01T10:00:00Z",
    "previous_hash": "0",
    "action": "secret_door_revealed",
    "details": {
      "secret_door_id": "secret1"
    },
    "hash": "6a9f78c..."
  },
  {
    "modification_id": "mod2",
    "party_id": "party1",
    "timestamp": "2023-10-01T10:05:00Z",
    "previous_hash": "6a9f78c...",
    "action": "monster_wounded",
    "details": {
      "monster_id": "yart_the_goblin_shaman"
    },
    "hash": "1a2b3c4..."
  }
]

# Example Requests
Get Dungeon Information
curl "http://localhost:3000/dungeon?dungeon_id=dungeon1"

Get Room Information
curl "http://localhost:3000/rooms/room2?party_id=party1&dungeon_id=dungeon1"

Add a Modification
curl -X POST http://localhost:3000/modifications \
  -H 'Content-Type: application/json' \
  -d '{
    "party_id": "party1",
    "dungeon_id": "dungeon1",
    "action": "secret_door_revealed",
    "details": {
      "secret_door_id": "secret1"
    }
  }'
