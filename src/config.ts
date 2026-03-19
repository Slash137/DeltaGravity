import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_USER_IDS: z.string().transform((val) => val.split(',').map(id => Number(id.trim()))),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_ROUTER_MODEL: z.string().default('llama-3.1-8b-instant'),
  GROQ_AUDIO_MODEL: z.string().default('whisper-large-v3-turbo'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default('CwhRBWXzGAHq8TQ4Fs17'), // Roger
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
});

export const config = configSchema.parse(process.env);
