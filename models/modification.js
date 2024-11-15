// models/modification.js
// --------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// --------------------------------

class Modification 
{
    constructor(partyId) 
    {
        this.partyId = partyId;
        this.modifications = this.loadModifications();
    }

    verifyIntegrity() 
    {
        for (let i = 1; i < this.modifications.length; i++) 
        {
            const previousHash = this.modifications[i - 1].hash;
            if (this.modifications[i].previous_hash !== previousHash) 
            {
                throw new Error('Modification chain is corrupted');
            }
        }
    }

    loadModifications() 
    {
        console.log("Loading modifications for party: ", this.partyId);

        const modPath = path.join(
            __dirname,
            '../data/modifications',
            `${this.partyId}_modifications.json`
        );

        console.log("modPath: ", modPath);

        if (fs.existsSync(modPath)) 
        {
            try {
                const fileContents = fs.readFileSync(modPath, 'utf8');
                if (!fileContents.trim()) {
                // File is empty
                return [];
                }
                const modifications = JSON.parse(fileContents);
                console.log("modifications: ", modifications);
                this.modifications = modifications;
                this.verifyIntegrity(); // Optional integrity check
                return modifications;
            } catch (e) {
                console.error(`Error loading modifications for party ${this.partyId}: ${e.message}`);
                // Decide how to handle the error:
                // Option 1: Return an empty array and continue
                return [];
                // Option 2: Throw an error to halt execution
                // throw new Error('Failed to load modifications');
            }
        }
        // File doesn't exist
        return [];
    }

    saveModifications() 
    {
        const modPath = path.join(
            __dirname,
            '../../data/modifications',
            `${this.partyId}_modifications.json`
        );
        fs.writeFileSync(modPath, JSON.stringify(this.modifications, null, 2));
    }

    addModification(action, details) 
    {
        const previousHash =
            this.modifications.length > 0
            ? this.modifications[this.modifications.length - 1].hash
            : '0';

        const modification = {
            modification_id: crypto.randomUUID(),
            party_id: this.partyId,
            timestamp: new Date().toISOString(),
            previous_hash: previousHash,
            action: action,
            details: details,
        };

        const hash = crypto
            .createHash('sha256')
            .update(
            modification.modification_id +
                modification.party_id +
                modification.timestamp +
                modification.previous_hash +
                modification.action +
                JSON.stringify(modification.details)
            )
            .digest('hex');

        modification.hash = hash;
        this.modifications.push(modification);
        this.saveModifications();
    }

    getModifications() 
    {
        console.log("Returning modifications: ", this.modifications);
        const mods = this.modifications;
        console.log("Found mods: ", mods);
        return mods;
    }
}

module.exports = Modification;
