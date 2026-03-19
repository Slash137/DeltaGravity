# DeltaGravity

DeltaGravity is a local, secure, and private AI agent that uses Telegram as its interface.

## Features

- **Cloud Persistence**: Uses Firebase Firestore to store conversation history and memory.
- **Agent Loop**: Capable of multi-step reasoning and tool usage.
- **Voice Support (End-to-End)**: Send voice notes transcribed by Whisper, get audio responses via ElevenLabs.
- **Telegram Interface**: Interact with your agent from anywhere via Telegram.
- **Modular Design**: Easy to extend with new tools and providers.

## Requirements

- Node.js 18+
- Groq API Key
- Telegram Bot Token

## Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment:
   Create a `.env` file based on the provided template and add your credentials.
   ```bash
   TELEGRAM_BOT_TOKEN="your_token"
   TELEGRAM_ALLOWED_USER_IDS="your_id"
   GROQ_API_KEY="your_groq_key"
   ```

## Usage

Start the agent in development mode:

```bash
npm run dev
```

## Tools

- `get_current_time`: Returns the current local time.

## Security

DeltaGravity includes a whitelist for Telegram User IDs. Only allowed users can interact with the agent.
