const fs = require('fs').promises;
const path = require('path');

class LogManager {
    constructor(baseLogDir = 'logs') {
        this.baseLogDir = baseLogDir;
        this.currentSessionId = null;
        this.currentSessionDir = null;
        this.ensureBaseLogDir();
    }

    async ensureBaseLogDir() {
        try {
            await fs.access(this.baseLogDir);
        } catch {
            await fs.mkdir(this.baseLogDir, { recursive: true });
        }
    }

    sanitizeFilename(text) {
        // Replace special characters with underscores, but preserve ! and $
        return text
            .toString()
            .toLowerCase()
            .replace(/[^\w\s!$-]/g, '_')  // Keep ! and $, replace other special chars with _
            .replace(/[-\s]+/g, '_')      // Replace multiple spaces/hyphens with single _
            .replace(/_+/g, '_')          // Replace multiple underscores with single _
            .trim();                      // Remove leading/trailing whitespace
    }

    generateSessionId() {
        // Get Unix timestamp in milliseconds for uniqueness
        return Date.now().toString();
    }

    async beginNewSession() {
        this.currentSessionId = this.generateSessionId();
        this.currentSessionDir = path.join(this.baseLogDir, this.currentSessionId);
        await fs.mkdir(this.currentSessionDir, { recursive: true });
        return this.currentSessionId;
    }

    async logInteraction(command, patterns, response) {
        // If no session exists, create one automatically
        if (!this.currentSessionDir) {
            await this.beginNewSession();
            console.log(`[LogManager] Auto-created new logging session: ${this.currentSessionId}`);
        }

        const timestamp = Date.now();
        
        // Create a unique filename
        const sanitizedCommand = this.sanitizeFilename(command.slice(0, 50)); // Limit length
        const sanitizedPatterns = patterns.map(p => this.sanitizeFilename(p)).join('_');
        const filename = `${timestamp}.${sanitizedCommand}_${sanitizedPatterns}.json`;

        const logData = {
            timestamp: new Date(timestamp).toISOString(),
            command,
            patterns,
            response,
            sessionId: this.currentSessionId
        };

        const filepath = path.join(this.currentSessionDir, filename);
        await fs.writeFile(
            filepath,
            JSON.stringify(logData, null, 2),
            'utf8'
        );

        return filepath;
    }

    getCurrentSession() {
        return {
            sessionId: this.currentSessionId,
            sessionDir: this.currentSessionDir
        };
    }
}

// Create and export a singleton instance
const logManager = new LogManager();
module.exports = logManager;
