// test.js
const readline = require('readline');
const fetch = require('node-fetch');
const { updateMap } = require('./utils/imageViewerManager');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Constants
const DISCORD_AUTOMATION_SERVER_PORT = process.env.DISCORD_AUTOMATION_SERVER_PORT || 3037;
const DISCORD_AUTOMATION_SERVER = `http://localhost:${DISCORD_AUTOMATION_SERVER_PORT}`;
const DISCORD_AUTOMATION_URL = `${DISCORD_AUTOMATION_SERVER}/discord`;
const DISCORD_AUTOMATION_COMMAND_ENDPOINT = `${DISCORD_AUTOMATION_SERVER}/discord/command`;
const DISCORD_AUTOMATION_MAP_ENDPOINT = `${DISCORD_AUTOMATION_SERVER}/discord/map`;
const DISCORD_AUTOMATION_IMAGE_ENDPOINT = `${DISCORD_AUTOMATION_SERVER}/discord/image`;
const MAP_RENDERER_ENDPOINT = `http://localhost:${DISCORD_AUTOMATION_SERVER_PORT}/renderer/map`;

let botUsername = 'Avrae';
let humanUsername = 'manu_mercs';

const printHelp = () => {
    console.log(`
Available commands:
  1. Command with optional pattern matching: text|pattern1|pattern2|...
     Example: !game status|Brussae
     Example: yes|combat end
     Example: !i end|sure

  2. Bot message: $bot <message>
     Example: $bot hello there
     Example: $bot !game status

System commands:
  $info           - Display information about the active Discord channel
  $botname <n>    - Sets the bot name to <n> for future requests
  $username <n>   - Sets the username to <n> for future requests
  $map <url>      - Opens a window to display the map at the given URL
  $image <url>    - Opens a window to display the image at the given URL
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

async function sendMessage(messageText) {
    try {
        const payload = {
            message: messageText.trim(),
            botUsername,  
            humanUsername
        };

        console.log('\nSending POST request to:', DISCORD_AUTOMATION_URL + '/message');
        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(DISCORD_AUTOMATION_URL + '/message', {
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

async function handleCommandResponse(response) {
    // If response has map URLs, display the latest map
    if (response.map_urls && response.map_urls.length > 0) {
        const latestMap = response.map_urls[response.map_urls.length - 1];
        try {
            const mapResponse = await fetch(DISCORD_AUTOMATION_MAP_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: latestMap })
            });
            if (!mapResponse.ok) {
                console.error('Error displaying map:', await mapResponse.text());
            } else {
                console.log('Map displayed successfully');
            }
        } catch (error) {
            console.error('Error displaying map:', error);
        }
    }

    // If response has image URLs, display them all in the gallery
    if (response.image_urls && response.image_urls.length > 0) {
        for (const imageUrl of response.image_urls) {
            try {
                const imageResponse = await fetch(DISCORD_AUTOMATION_IMAGE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        imageUrl,
                        metadata: {
                            source: 'command_response',
                            command: response.text || 'Unknown command',
                            timestamp: new Date().toISOString()
                        }
                    })
                });
                if (!imageResponse.ok) {
                    console.error('Error displaying image:', await imageResponse.text());
                } else {
                    console.log('Image added to gallery successfully');
                }
            } catch (error) {
                console.error('Error displaying image:', error);
            }
        }
    }
}

async function processCommand(messageText) {
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
        await handleCommandResponse(data);
        return data;
    } catch (error) {
        console.error('\nError sending command:', error);
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

async function promptUser() {
    try {
        const answer = await new Promise(resolve => {
            rl.question('> ', resolve);
        });

        if (!answer || answer.trim() === '') {
            return promptUser();
        }

        const trimmedAnswer = answer.trim();

        // Handle system commands
        if (trimmedAnswer.startsWith('$')) {
            const [command, ...args] = trimmedAnswer.slice(1).split(' ');
            
            switch (command) {
                case 'bot':
                    // Format: $bot <message>
                    // Sends message via message route
                    if (args.length > 0) {
                        await sendMessage(args.join(' '));
                    } else {
                        console.log('Error: Bot message required');
                    }
                    break;
                case 'map':
                    // Format: $map <url>
                    if (args[0]) {
                        try {
                            const response = await fetch(DISCORD_AUTOMATION_MAP_ENDPOINT, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ imageUrl: args[0] }),
                            });
                            
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            console.log('Map window updated successfully');
                        } catch (error) {
                            console.error('Error updating map:', error.message);
                        }
                    } else {
                        console.log('Error: Map URL required');
                    }
                    break;
                case 'image':
                    // Format: $image <url>
                    if (args[0]) {
                        try {
                            const response = await fetch(DISCORD_AUTOMATION_IMAGE_ENDPOINT, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ imageUrl: args[0] }),
                            });
                            
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            console.log('Image window updated successfully');
                        } catch (error) {
                            console.error('Error updating image:', error.message);
                        }
                    } else {
                        console.log('Error: Image URL required');
                    }
                    break;
                case 'info':
                    await getChannelInfo();
                    break;
                case 'botname':
                    if (args[0]) {
                        botUsername = args[0];
                        console.log(`Bot username set to: ${botUsername}`);
                    }
                    break;
                case 'username':
                    if (args[0]) {
                        humanUsername = args[0];
                        console.log(`Username set to: ${humanUsername}`);
                    }
                    break;
                case 'help':
                    printHelp();
                    break;
                case 'quit':
                    console.log('Goodbye!');
                    rl.close();
                    return;
                default:
                    console.log('Unknown system command. Type $help for available commands.');
            }
        } else {
            // Handle regular commands
            await processCommand(trimmedAnswer);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Continue prompting
    promptUser();
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
