import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const configSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_USER_IDS: z.string().transform((val) => val.split(',').map(id => Number(id.trim()))),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_ROUTER_MODEL: z.string().default('llama-3.1-8b-instant'),
  GROQ_AUDIO_MODEL: z.string().default('whisper-large-v3-turbo'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-4o-mini-transcribe'),
  OPENAI_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  OPENAI_TTS_VOICE: z.string().default('alloy'),
  TTSTT_BASE_URL: z.string().optional(),
  TTSTT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  GITHUB_MODELS_API_KEY: z.string().optional(),
  GITHUB_MODEL: z.string().default('gpt-4o-mini'),
  COHERE_API_KEY: z.string().optional(),
  COHERE_MODEL: z.string().default('command-r-plus'),
  HUGGINGFACE_API_KEY: z.string().optional(),
  HUGGINGFACE_MODEL: z.string().default('meta-llama/Meta-Llama-3-8B-Instruct'),
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_MODEL: z.string().default('mistral-small-latest'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('openrouter/free'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default('./service-account.json'),
  AGENT_BACKEND: z.enum(['codex', 'router', 'ollama']).transform((value) => value === 'codex' ? 'ollama' : value).default('ollama'),
  OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5-coder:14b'),
  OLLAMA_API_KEY: z.string().optional(),
  CODEX_BIN: z.string().default('codex'),
  CODEX_MODEL: z.string().optional(),
  CODEX_DEFAULT_CWD: z.string().default(process.cwd()),
  CODEX_FULL_AUTO: z.string().optional().transform((value) => parseBoolean(value, true)),
  CODEX_DANGEROUS_BYPASS: z.string().optional().transform((value) => parseBoolean(value, false)),
  SELF_REPO_PATH: z.string().default('/home/cayetano/Proyectos/DeltaGravity'),
  SELF_DOCKER_COMPOSE_DIR: z.string().default('/home/cayetano/Proyectos/DeltaGravity'),
  SELF_DOCKER_SERVICE: z.string().default('deltagravity'),
  SELF_RESTART_HELPER_IMAGE: z.string().default('deltagravity:local'),
  HEALTH_PORT: z.coerce.number().int().positive().default(3001),
  HEALTH_PROBE_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  HEALTH_PROBE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  HEALTH_STARTUP_GRACE_MS: z.coerce.number().int().positive().default(120000),
  HEALTH_EVENT_LOOP_STALE_MS: z.coerce.number().int().positive().default(15000),
  HEALTH_PROBE_STALE_MS: z.coerce.number().int().positive().default(120000),
});

const normalizedEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, normalizeEnvValue(value)]),
);

for (const [key, value] of Object.entries(normalizedEnv)) {
  if (value !== undefined) {
    process.env[key] = value;
  }
}

export const config = configSchema.parse(normalizedEnv);
