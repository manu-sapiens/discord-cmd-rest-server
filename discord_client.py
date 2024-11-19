#!/usr/bin/env python3
import os
import json
import time
import asyncio
import aiohttp
from datetime import datetime
from typing import Optional, List, Dict, Any

# Configuration
LOG_DIR = "logs"
PARTY_ID = os.getenv("PARTY_ID", "default")
GAME_SESSION_ID = os.getenv("GAME_SESSION_ID", "default")
DUNGEONHELPER_AVRAE_COMMAND_ENDPOINT = "http://localhost:3037/discord/message"

# Rate limiting
last_fetch_time = 0
RATE_LIMIT_DELAY = 1  # seconds between requests


class DiscordResponse:
    def __init__(self, data: Dict[str, Any]):
        self.status: str = data.get('status', 'error')
        self.elapsed_time: int = data.get('elapsedTime', 0)
        self.match_index: Optional[int] = data.get('matchIndex')
        self.error: Optional[str] = data.get('error')
        self.contents: List[Dict[str, Any]] = data.get('contents', [])

    @property
    def is_success(self) -> bool:
        return self.status == 'success'

    @property
    def is_timeout(self) -> bool:
        return self.status == 'timeout'

    @property
    def is_error(self) -> bool:
        return self.status == 'error'

    def print_contents(self) -> None:
        """Print all response contents in a formatted way."""
        if not self.contents:
            print("No content in response")
            return

        for idx, entry in enumerate(self.contents, 1):
            sender = entry.get('sender', 'Unknown sender')
            print(f"\nResponse #{idx} from {sender}:")

            if 'text' in entry:
                print(f"Text: [{entry['text']}]")

            embed = entry.get('embed')
            if embed:
                print("---- Embed ----")
                if isinstance(embed, list):
                    for line_idx, line in enumerate(embed, 1):
                        print(f"| Line {line_idx}: {line}")
                else:
                    print(embed)
                print("-------------")


def sanitize_filename(filename: str) -> str:
    """Sanitize a string to be used as a filename."""
    # Replace invalid characters with underscore
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename


def create_log_entry(
    command: str,
    bot_username: str,
    human_username: str,
    response_data: Optional[Dict[str, Any]],
    response_patterns: Optional[List[str]] = None) -> str:
    """
    Create and write a log entry for a Discord command interaction.

    Args:
        command: The command that was sent
        bot_username: The bot's username
        human_username: The human user's username
        response_data: The response data from the server
        response_patterns: List of patterns that were matched against

    Returns:
        Path to the written log file
    """
    # Create the log entry data
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "unix_time": int(time.time()),
        "command": command,
        "bot_username": bot_username,
        "human_username": human_username,
        "response_patterns": response_patterns,
        "response": response_data
    }

    # Create log directory structure
    log_subdir = os.path.join(LOG_DIR, PARTY_ID, GAME_SESSION_ID)
    os.makedirs(log_subdir, exist_ok=True)

    # Create unique filename using unix timestamp
    timestamp = int(time.time() * 1000)  # millisecond precision
    base_name = sanitize_filename(command)
    filename = f"{base_name}.{timestamp}.json"
    log_path = os.path.join(log_subdir, filename)

    # Write log entry
    with open(log_path, 'w') as f:
        json.dump(log_entry, f, indent=2)

    return log_path
#


async def async__post(
    endpoint: str,
    payload: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Make an HTTP request to the Discord automation server.

    Args:
        endpoint: The endpoint URL
        payload: The request payload

    Returns:
        Response data as dictionary if successful, None otherwise
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(endpoint, json=payload) as response:
                response.raise_for_status()
                return await response.json()
    except aiohttp.ClientError as e:
        print(f"Request error: {e}")
        return None


async def async__send_avrae_command(
    command: str,
    bot_username: str,
    human_username: str,
    response_patterns: Optional[List[str]] = None
) -> Optional[DiscordResponse]:
    """
    Send a command to the Discord bot and return the response.

    Args:
        command: The command to send
        bot_username: The bot's username
        human_username: The human user's username
        response_patterns: List of patterns to match in the response

    Returns:
        DiscordResponse object or None if the request failed
    """
    global last_fetch_time

    # Clean up the command
    message = command.strip()
    print(f"[SENDING] COMMAND = [{message}] TO = [{bot_username}] FROM = [{human_username}]")

    # Rate limiting
    current_time = time.time()
    if current_time - last_fetch_time < RATE_LIMIT_DELAY:
        await asyncio.sleep(RATE_LIMIT_DELAY - (current_time - last_fetch_time))
    last_fetch_time = time.time()

    # Prepare request payload
    payload = {
        'message': message,
        'botUsername': bot_username,
        'humanUsername': human_username,
        'useBot': not message.startswith('!'),
        'options': {
            'expectBotResponse': True,
            'expectEcho': True,
            'responseMatch': response_patterns,
            'timeout': 20000  # 20 second timeout
        }
    }

    # Make the request
    data = await async__post(DUNGEONHELPER_AVRAE_COMMAND_ENDPOINT, payload)

    # Create and write log entry
    log_path = create_log_entry(
        command=message,
        bot_username=bot_username,
        human_username=human_username,
        response_data=data if data is not None else {"error": "Request failed"},
        response_patterns=response_patterns
    )
    print(f"[LOG] {'Response' if data else 'Error'} logged to {log_path}")

    # Return DiscordResponse if we got data
    return DiscordResponse(data) if data is not None else None


async def main():
    """Example usage of the Discord client."""
    # Example command with pattern matching
    response = await async__send_avrae_command(
        "!game status",
        "Avrae",
        "user123",
        response_patterns=["Eldara", "Waterdeep"]
    )

    if response:
        print(f"\nStatus: {response.status}")
        print(f"Elapsed Time: {response.elapsed_time}ms")

        if response.is_error:
            print(f"Error: {response.error}")
        elif response.match_index is not None:
            print(f"Pattern matched at index: {response.match_index}")

        if response.contents:
            response.print_contents()

if __name__ == "__main__":
    asyncio.run(main())
