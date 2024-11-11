// test.js
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const DISCORD_AUTOMATION_SERVER_PORT = 3038;
const DISCORD_AUTOMATION_URL = `http://localhost:${DISCORD_AUTOMATION_SERVER_PORT}`
const DISCORD_AUTOMATION_SEND_COMMAND_ENDPOINT = `${DISCORD_AUTOMATION_URL}/send-command`;
console.log("DISCORD_AUTOMATION_SEND_COMMAND_ENDPOINT =", DISCORD_AUTOMATION_SEND_COMMAND_ENDPOINT);
const DISCORD_AUTOMATION_SEND_MESSAGE_ENDPOINT = `${DISCORD_AUTOMATION_URL}/send-message`;
console.log("DISCORD_AUTOMATION_SEND_MESSAGE_ENDPOINT =", DISCORD_AUTOMATION_SEND_MESSAGE_ENDPOINT);
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

function handleResponse(data) 
{
    const contents = data?.response?.contents;
    const error = data?.response?.error;
    if (error)
    {
        console.error('Received an error response from the server:', error);
    }
    
    if (!contents) 
    {
        console.warn("Unexpected empty response contents:", data);
        return;
    }

    let data_list = contents;
    
    // if it is not a list, make one
    if (!Array.isArray(data_list))
    {
        console.warn('Received a non-list response from the server. Wrapping in a list.');
        console.log('Data:', data);
        console.log('Data.response:', data.response)
        console.log('Data.response.contents:', data.response.contents);
        
        data_list = [data_list];
    }

    if (data_list.length === 0) 
    {
        console.log('Received an empty response from the server. This is probably expected');
        return;
    }

    let got_good_response = false;
    let counter = 0;

    data_list.forEach((entry, index) => 
    {
        counter++;
        const sender = entry.sender;
        // console.log(`Response #[${index + 1}], from ${sender}:`);
        if (entry.text) 
        {
            console.log(`---- Text [${counter}] ----`);
            console.log(entry.text);
            got_good_response = true;
        }
        const embed = entry.embed;
        if (embed) 
        {
            got_good_response = true;
            console.log(`---- Embed [${counter}] ----`);
            if (!Array.isArray(embed)) 
            {
                console.log(embed);
            }
            else embed.forEach((line, index) =>
            {
                console.log(`[${counter}][${index + 1}]: ${line}`);
            });
            console.log("------------");
        }
    });

    if (!got_good_response)
    {
        console.error('Unexpected response format:', data);
    }

    return;
}

function promptUser()
{
    rl.question('Enter command: ', async (input) => {
        const [command, ...args] = input.trim().split(' ');

        console.log("[You entered] COMMAND =", command);
        console.log("[You entered] ARGS =", args);
        let message = '';

        switch (command) {

            case '$quit':
                console.log('Exiting...');
                rl.close();
                return;

            case '$status':
                console.log("[STATUS] USERNAME", humanUsername);
                console.log("[STATUS] BOTNAME", botUsername);
                break;

            case '$help':
                printHelp();
                break;

            case '$botname':
                botUsername = args.join(' ');
                console.log(`[LOCAL] Bot name changed to: ${botUsername}`);
                break;

            case '$username':
                humanUsername = args.join(' ');
                console.log(`[LOCAL] Username changed to: ${humanUsername}`);
                break;

            case '$message':
                // Send to 'send-message' endpoint, removing the '$message' command from it
                message = args.join(' ');
                console.log("[SENDING] MESSAGE =[", message, "] TO =[", botUsername, "] FROM =[", humanUsername,"]");
                try {
                    const response = await axios.post(DISCORD_AUTOMATION_SEND_MESSAGE_ENDPOINT, {
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
                break;

            default:
                // Send to 'send-command' endpoint with a specific command
                message = `${command} ${args.join(' ')}`.trim();
                console.log("[SENDING] COMMAND =[", message, "] TO =[", botUsername, "] FROM =[", humanUsername,"]");
                try {
                    const response = await axios.post(DISCORD_AUTOMATION_SEND_COMMAND_ENDPOINT, {
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
                break;
        }


        // Prompt for the next command
        promptUser();
    });
}

// Start prompting the user
promptUser();
