// test.js
const readline = require('readline');
const fetch = require('node-fetch');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const DISCORD_AUTOMATION_SERVER_PORT = 3037;
const DISCORD_AUTOMATION_URL = `http://localhost:${DISCORD_AUTOMATION_SERVER_PORT}/discord`;
const DISCORD_AUTOMATION_MESSAGE_ENDPOINT = `${DISCORD_AUTOMATION_URL}/message`;

let botUsername = 'Avrae';
let humanUsername = 'manu_mercs';

const printHelp = () => {
    console.log(`
Available commands:
  Messages starting with '!' will use browser automation (e.g., "!roll 1d20")
  Format: command|response_match
  Example: !init list|current initiative

System commands:
  $info              - Display information about the active Discord channel
  $botname <name>    - Sets the bot name to <name> for future requests
  $username <name>   - Sets the username to <name> for future requests
  $help              - Displays this list of available commands
  $quit             - Exits the script
`);
};

async function getChannelInfo() {
    try {
        const response = await fetch(`${DISCORD_AUTOMATION_URL}/info`);
        const data = await response.json();
        console.log('\nChannel Information:');
        console.log('-------------------');
        if (data.info) {
            console.log('Channel:', data.info.channelName, `(${data.info.channelId})`);
            console.log('Type:', data.info.channelType);
            console.log('Server:', data.info.guildName, `(${data.info.guildId})`);
            console.log('Bot:', data.info.botName, `(${data.info.botId})`);
        } else {
            console.log(data);
        }
        console.log('-------------------\n');
    } catch (error) {
        console.error('Error getting channel info:', error.message);
    }
}

async function sendMessage(messageText, responseMatch = null) {
    try {
        const payload = {
            message: messageText,
            botUsername,  
            humanUsername,
            useBot: !messageText.startsWith('!'),
            options: {
                expectBotResponse: true,
                expectEcho: true,
                responseMatch: responseMatch,
                timeout: 20000
            }
        };

        console.log('\nSending POST request to:', DISCORD_AUTOMATION_MESSAGE_ENDPOINT);
        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(DISCORD_AUTOMATION_MESSAGE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        console.log('\nResponse status:', response.status);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        console.log('\nReceived response:', JSON.stringify(data, null, 2));
        handleResponse(data);
        return data;
    } catch (error) {
        console.error('\nError sending message:', error);
        throw error;
    }
}

function handleResponse(data) {
    if (!data) {
        console.warn("Empty response received");
        return;
    }

    console.log('\nProcessing response:', JSON.stringify(data, null, 2));

    if (data.error) {
        console.error("Error:", data.error);
        return;
    }

    if (data.response) {
        console.log("\nBot response:", data.response.text);
        console.log("Response time:", data.elapsedTime, "ms");
    }

    if (data.status === 'timeout') {
        console.log("Operation timed out waiting for bot response");
    } else if (data.status === 'success') {
        console.log("Successfully received bot response");
    }
}

function promptUser() {
    rl.question('> ', async (input) => {
        if (input.toLowerCase() === '$quit') {
            console.log('Goodbye!');
            process.exit(0);
        } else if (input.toLowerCase() === '$help') {
            printHelp();
        } else if (input.toLowerCase() === '$info') {
            await getChannelInfo();
        } else if (input.toLowerCase().startsWith('$botname ')) {
            botUsername = input.slice(9);
            console.log(`Bot username set to: ${botUsername}`);
        } else if (input.toLowerCase().startsWith('$username ')) {
            humanUsername = input.slice(10);
            console.log(`Human username set to: ${humanUsername}`);
        } else {
            // Check if it's a command with response match pattern
            const parts = input.split('|');
            if (parts.length === 2) {
                await sendMessage(parts[0].trim(), parts[1].trim());
            } else {
                await sendMessage(input);
            }
        }
        promptUser();
    });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\nGoodbye!');
    process.exit(0);
});

process.on('exit', () => {
    rl.close();
});

console.log("Welcome to Discord Automation!");
console.log("Type '$help' to list available commands.");
printHelp();
promptUser();
