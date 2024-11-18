// models/dungeon.js
// --------------------------------
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { start } = require('repl');
// --------------------------------

class Dungeon {
  constructor(dungeonId) {
    this.dungeonId = dungeonId;
    this.data = this.loadDungeonData();
  }

    getDungeonInfo() 
    {

        const starting_room_id = this.data.starting_room_id;
        const start_room_info = this.data.rooms.find((room) => room.room_id === starting_room_id);

        const dungeon_info = 
        {
            dungeon_id: this.data.dungeon_id,
            name: this.data.name,
            level_min: this.data.level_min,
            level_max: this.data.level_max,
            recommended_party_size: this.data.recommended_party_size,
            description: this.data.description,
            adventure_hook: this.data.adventure_hook,
            rumors: this.data.rumors,
            starting_room_id: starting_room_id,
            starting_room_info: start_room_info,
            rooms: this.data.rooms,
            monsters: this.data.monsters,
            loot: this.data.loot,
            connections: this.data.connections,

        };
        console.log("----------");
        console.log("dungeon_info: ", dungeon_info);
        return dungeon_info;
    }
    
    loadDungeonData() {
    const dungeonPath = path.join(
        __dirname,
        '../data/dungeons',
        `${this.dungeonId}.yaml`
    );
    try {
        const fileContents = fs.readFileSync(dungeonPath, 'utf8');
        return yaml.load(fileContents);
    } catch (e) {
        console.error(`Failed to load dungeon data: ${e}`);
        throw e;
    }
    }

    getRoom(roomId) {
    return this.data.rooms.find((room) => room.room_id === roomId);
    }

    applyModifications(modifications) {
        modifications.forEach((mod) => {
        switch (mod.action) {
            case 'secret_door_revealed':
            this.revealSecretDoor(mod.details.secret_door_id);
            break;
            case 'monster_wounded':
            this.woundMonster(mod.details.monster_id);
            break;
            // Add cases for other actions
            default:
            console.warn(`Unknown action: ${mod.action}`);
        }
        });
    }
  
    revealSecretDoor(secretDoorId) {
    this.data.rooms.forEach((room) => {
        room.connections.forEach((conn) => {
        if (conn.type === 'secret_door' && conn.secret_door_id === secretDoorId) {
            conn.revealed = true;
        }
        });
    });
    }

    woundMonster(monsterId) {
    // Implement logic to mark the monster as wounded
    }
}  

module.exports = Dungeon;
