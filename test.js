// test.js
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let botUsername = 'Avrae';
let humanUsername = 'manu_mercs';

const printHelp = () => {
    console.log(`
Available commands:
  $message <text>        - Sends <text> to the 'send-message' endpoint.
  $botname <name>        - Sets the bot name to <name> for future requests.
  $username <name>       - Sets the username to <name> for future requests.
  $help                  - Displays this list of available commands.
  $quit                  - Exits the script.
Any other input will be sent to the 'send-command' endpoint.
`);
};

console.log("Welcome! Type '$help' to list available commands.");
printHelp();

const handleResponse = (data) => {
    if (data === null) {
        console.log('Received a null response from the server.');
    } else if (typeof data.content === 'string') {
        if (data.content.trim() === '') {
            console.log('Received an empty text response from the server.');
        } else {
            console.log('Received text content from the server:');
            console.log(data.content);
        }
    } else if (Array.isArray(data.content)) {
        if (data.content.length === 0) {
            console.log('Received an empty embed array from the server.');
        } else {
            console.log('Received embed content from the server:');
            data.content.forEach((line, index) => {
                console.log(`Line ${index + 1}: ${line}`);
            });
        }
    } else {
        console.log('Unexpected response format:', data);
    }
};

const promptUser = () => {
    rl.question('Enter command: ', async (input) => {
        const [command, ...args] = input.trim().split(' ');

        console.log("[You entered] COMMAND =", command);
        console.log("[You entered] ARGS =", args);

        
        if (command === '$quit') {
            console.log('Exiting...');
            rl.close();
            return;
        } else if (command === '$status') {
        console.log("[STATUS] USERNAME", humanUsername);
        console.log("[STATUS] BOTNAME", botUsername);
        } 
        else if (command === '$help') {
            printHelp();
        } else if (command === '$botname') {
            botUsername = args.join(' ');
            console.log(`[LOCAL] Bot name changed to: ${botUsername}`);
        } else if (command === '$username') {
            humanUsername = args.join(' ');
            console.log(`[LOCAL] Username changed to: ${humanUsername}`);
        } else if (command === '$message') {
            // Send to 'send-message' endpoint
            const message = args.join(' ');
            console.log("[SENDING] MESSAGE =", message);
            try {
                const response = await axios.post('http://localhost:3000/send-message', {
                    message,
                    botUsername,
                    humanUsername
                });
                fs.writeFileSync('response.json', JSON.stringify(response.data, null, 2));
                console.log('Response:', response.data);
                handleResponse(response.data);
            } catch (error) {
                console.error('ERROR:', error.message);
                if (error.response) {
                    console.log("ERROR Status:", error.response.status);
                    console.log("ERROR Data:", error.response.data);
                }
            }
        } else {
            // Send to 'send-command' endpoint with a specific command
            const message = `${command} ${args.join(' ')}`.trim();
            console.log("MESSAGE =", message);
            try {
                const response = await axios.post('http://localhost:3000/send-command', {
                    message,
                    botUsername,
                    humanUsername
                });
                fs.writeFileSync('./out/response.json', JSON.stringify(response.data, null, 2));
                console.log('Response:', response.data);
                handleResponse(response.data);
            } catch (error) {
                console.error('ERROR:', error.message);
                if (error.response) {
                    console.log("ERROR Status:", error.response.status);
                    console.log("ERROR Data:", error.response.data);
                }
            }
        }

        // Prompt for the next command
        promptUser();
    });
};

// Start prompting the user
promptUser();
