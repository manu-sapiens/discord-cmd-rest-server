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

const promptUser = () => {
    rl.question('Enter command: ', async (input) => {
        const [command, ...args] = input.trim().split(' ');
        console.log("USERNAME", humanUsername);
        console.log("BOTNAME", botUsername);
        console.log("COMMAND = ", command);
        console.log("ARGS = ", args);

        if (command === '$quit') {
            console.log('Exiting...');
            rl.close();
            return;
        } else if (command === '$help') {
            printHelp();
        } else if (command === '$botname') {
            botUsername = args.join(' ');
            console.log(`Bot name changed to: ${botUsername}`);
        } else if (command === '$username') {
            humanUsername = args.join(' ');
            console.log(`Username changed to: ${humanUsername}`);
        } else if (command === '$message') {
            // Send to 'send-message' endpoint
            const message = args.join(' ');
            console.log("MESSAGE = ", message);
            try {
                const response = await axios.post('http://localhost:3000/send-message', {
                    message,
                    botUsername,
                    humanUsername
                });
                fs.writeFileSync('response.json', JSON.stringify(response.data, null, 2));
                console.log('Response:', response.data);
            } catch (error) {
                console.error('ERROR:', error.message);
                console.log("ERROR Status: ", error.response.status);
                console.log("ERROR Data: ", error.response.data);                
            }
        } else {
            // Send to 'send-command' endpoint with a specific command
            const message = command+ " " + args.join(' ');
            console.log("MESSAGE = ", message);
            try {
                const response = await axios.post('http://localhost:3000/send-command', {
                    message,
                    botUsername,
                    humanUsername
                });
                fs.writeFileSync('response.json', JSON.stringify(response.data, null, 2));
                console.log('Response:', response.data);
            } catch (error) {
                console.error('ERROR:', error.message);
                console.log("ERROR Status: ", error.response.status);
                console.log("ERROR Data: ", error.response.data);                
            }
        }

        // Prompt for the next command
        promptUser();
    });
};

// Start prompting the user
promptUser();
