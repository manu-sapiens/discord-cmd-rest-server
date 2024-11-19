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
const DISCORD_AUTOMATION_COMMAND_ENDPOINT = `${DISCORD_AUTOMATION_URL}/command`;

let botUsername = 'Avrae';
let humanUsername = 'manu_mercs';

const printHelp = () => {
    console.log(`
Available commands:
  Messages starting with '!' will use browser automation (e.g., "!roll 1d20")
  
Command formats:
  1. Simple command: !command
     Example: !init list
  
  2. Command with pattern matching: command|pattern1|pattern2|...
     Example: !init list|current initiative
     Example: !init list|current|next|previous
     Example: !game status|Eldara

System commands:
  $info           - Display information about the active Discord channel
  $botname <n>    - Sets the bot name to <n> for future requests
  $username <n>   - Sets the username to <n> for future requests
  $help           - Displays this list of available commands
  $quit           - Exits the script
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

async function sendCommand(messageText) {
    try {
        // Split the input to separate command from patterns
        const [command, ...patterns] = messageText.split('|');
        const trimmedCommand = command.trim();
        
        const payload = {
            message: trimmedCommand,
            botUsername,  
            humanUsername,
            patterns: patterns.length > 0 ? patterns.map(p => p.trim()) : []
        };

        console.log('\nSending POST request to:', DISCORD_AUTOMATION_COMMAND_ENDPOINT);
        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(DISCORD_AUTOMATION_COMMAND_ENDPOINT, {
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
        console.error('\nError sending command:', error);
        throw error;
    }
}

async function sendMessage(messageText) {
    try {
        const payload = {
            message: messageText.trim(),
            botUsername,  
            humanUsername
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
        console.log('No data received');
        return;
    }

    if (data.error) {
        console.error('Error:', data.error);
        return;
    }

    if (data.match) {
        console.log('\nPattern matched:', data.match);
        if (data.text) {
            console.log('Matching message:', data.text);
        }
        if (data.embeds) {
            console.log('Matching embeds:');
            data.embeds.forEach((embed, i) => {
                console.log(`\nEmbed #${i + 1}:`);
                if (embed.title) console.log('Title:', embed.title);
                if (embed.description) console.log('Description:', embed.description);
                if (embed.fields) {
                    console.log('Fields:');
                    embed.fields.forEach(field => {
                        console.log(`- ${field.name}: ${field.value}`);
                    });
                }
            });
        }
        console.log('\nAll messages received:');
    }

    if (data.contents) {
        printContents(data.contents);
    }
}

function printContents(contents) {
    contents.forEach((content, index) => {
        console.log(`\nResponse #${index + 1} from ${content.sender}:`);
        
        if (content.text) {
            console.log('Text:', content.text);
        }
        
        if (content.embeds) {
            content.embeds.forEach((embed, i) => {
                console.log(`\n---- Embed #${i + 1} ----`);
                if (embed.title) console.log('Title:', embed.title);
                if (embed.description) console.log('Description:', embed.description);
                if (embed.fields) {
                    console.log('Fields:');
                    embed.fields.forEach(field => {
                        console.log(`- ${field.name}: ${field.value}`);
                    });
                }
                console.log('------------------');
            });
        }
    });
}

function promptUser() {
    rl.question('> ', async (input) => {
        try {
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
            } else if (input.startsWith('!')) {
                try {
                    await sendCommand(input);
                } catch (error) {
                    console.error('\nError executing command:', error.message);
                    if (error.response) {
                        console.error('Server response:', await error.response.text());
                    }
                }
            } else if (!input.startsWith('$')) {
                try {
                    await sendMessage(input);
                } catch (error) {
                    console.error('\nError sending message:', error.message);
                    if (error.response) {
                        console.error('Server response:', await error.response.text());
                    }
                }
            }
        } catch (error) {
            console.error('\nUnexpected error:', error.message);
        }
        promptUser();
    });
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\nGoodbye!');
    rl.close();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('\nUncaught error:', error);
    console.log('\nRecovering and continuing...');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('\nUnhandled promise rejection:', error);
    console.log('\nRecovering and continuing...');
});

process.on('exit', () => {
    rl.close();
});

console.log("Welcome to Discord Automation!");
console.log("Type '$help' to list available commands.");
printHelp();
promptUser();
