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

## Run At Boot

To ensure DeltaGravity is recreated automatically after a host reboot, install the included `systemd` unit:

```bash
sudo cp deltagravity.service /etc/systemd/system/deltagravity.service
sudo systemctl daemon-reload
sudo systemctl enable --now deltagravity.service
```

This uses `docker compose up -d` on boot, so it recreates the container even if it does not already exist.

To recover automatically from silent hangs, install the watchdog timer too:

```bash
chmod +x scripts/watchdog.sh
sudo cp deltagravity-watchdog.service /etc/systemd/system/deltagravity-watchdog.service
sudo cp deltagravity-watchdog.timer /etc/systemd/system/deltagravity-watchdog.timer
sudo systemctl daemon-reload
sudo systemctl enable --now deltagravity-watchdog.timer
```

The container now exposes `/healthz`, Docker marks it as unhealthy if the event loop or Telegram probe stops responding, and the watchdog restarts the container when that happens.

## Backends via Telegram

DeltaGravity can use `codex`, `router`, or a remote `ollama` backend for Telegram conversations.

Environment variables:

```bash
AGENT_BACKEND="ollama"
OLLAMA_BASE_URL="http://192.168.3.50:11434"
OLLAMA_MODEL="qwen2.5-coder:14b"
CODEX_BIN="codex"
CODEX_DEFAULT_CWD="/home/cayetano/Proyectos"
CODEX_FULL_AUTO="true"
CODEX_DANGEROUS_BYPASS="false"
```

Useful Telegram commands:

- `/backend codex`, `/backend router`, or `/backend ollama`
- `/cwd /absolute/path/to/project`
- `/status`
- `/resetcodex`
- `/clear`

Recommended flow:

1. Set `/cwd` to the repository you want Codex to work on.
2. Send your task in Telegram.
3. DeltaGravity resumes the same Codex session for subsequent messages in that chat until you run `/resetcodex` or `/clear`.

## Codex -> Telegram notifications

This repository now includes a repo-local `hooks.json` for Codex. When Codex finishes a turn inside this project, it triggers a `Stop` hook and sends a Telegram message through the same bot used by DeltaGravity.

Required environment variables:

```bash
TELEGRAM_BOT_TOKEN="your_token"
TELEGRAM_ALLOWED_USER_IDS="your_telegram_user_id"
TELEGRAM_NOTIFY_CHAT_ID="your_private_chat_id"
```

Notes:

- `TELEGRAM_NOTIFY_CHAT_ID` is optional. If omitted, the hook uses the first ID from `TELEGRAM_ALLOWED_USER_IDS`.
- This works on another device after cloning the repo as long as that device also has the same environment variables in `.env`.
- Secrets are not committed to git. Use `.env.example` as the template.

## Tools

- `get_current_time`: Returns the current local time.

## Security

DeltaGravity includes a whitelist for Telegram User IDs. Only allowed users can interact with the agent.
