import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');
const MAX_SUMMARY_LENGTH = 1400;
const MAX_MESSAGE_LENGTH = 4096;

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function pickChatId() {
  const explicitChatId =
    process.env.TELEGRAM_NOTIFY_CHAT_ID || process.env.DELTAGRAVITY_NOTIFY_CHAT_ID;
  if (explicitChatId) {
    return explicitChatId.trim();
  }

  const allowedUsers = process.env.TELEGRAM_ALLOWED_USER_IDS || '';
  const firstAllowedUser = allowedUsers
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);

  return firstAllowedUser || '';
}

function truncate(text, maxLength) {
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildMessage(payload) {
  const projectName = path.basename(repoRoot);
  const cwd = payload.cwd || repoRoot;
  const relativeCwd = path.relative(repoRoot, cwd);
  const location = relativeCwd && relativeCwd !== '' ? relativeCwd : '.';
  const summary = truncate(
    (payload.last_assistant_message || 'Codex terminó sin mensaje final visible.').trim(),
    MAX_SUMMARY_LENGTH,
  );

  const body = [
    `DeltaGravity: Codex ha terminado una tarea.`,
    `Proyecto: ${projectName}`,
    `Ubicación: ${location}`,
    `Modelo: ${payload.model || 'desconocido'}`,
    `Turno: ${payload.turn_id || 'desconocido'}`,
    '',
    `Resumen:`,
    summary,
  ].join('\n');

  return truncate(body, MAX_MESSAGE_LENGTH);
}

async function sendTelegramMessage(botToken, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Telegram API ${response.status}: ${responseText}`);
  }
}

async function main() {
  loadDotEnv(envPath);

  const rawInput = await readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};

  if (payload.hook_event_name !== 'Stop') {
    process.stdout.write('{}\n');
    return;
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = pickChatId();

  if (!botToken || !chatId) {
    process.stderr.write(
      'Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or notify chat id.\n',
    );
    process.stdout.write('{}\n');
    return;
  }

  const message = buildMessage(payload);
  await sendTelegramMessage(botToken, chatId, message);
  process.stdout.write('{}\n');
}

main().catch((error) => {
  process.stderr.write(`Telegram notification failed: ${error.message}\n`);
  process.stdout.write('{}\n');
});
