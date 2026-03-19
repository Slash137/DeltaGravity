import Groq, { toFile } from 'groq-sdk';
import { config } from '../config.js';

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export const evaluateTaskComplexity = async (userMessage: string): Promise<'FACIL' | 'COMPLEJA'> => {
  try {
    const response = await groq.chat.completions.create({
      model: config.GROQ_ROUTER_MODEL,
      messages: [{ role: 'system', content: "Clasifica la siguiente tarea según su dificultad en una de estas palabras: FACIL o COMPLEJA. Responde SOLO la palabra. Buscar respuestas directas o saludos = FACIL. Crear código avanzado o estructuras = COMPLEJA." }, { role: 'user', content: userMessage }],
      max_tokens: 10, temperature: 0.1,
    });
    return response.choices[0]?.message?.content?.trim().toUpperCase() === 'COMPLEJA' ? 'COMPLEJA' : 'FACIL';
  } catch (err) {
    return 'FACIL';
  }
};

type LLMFetcher = (messages: ChatMessage[], tools: any[]) => Promise<any>;

const callOpenAICompatibleAPI = async (name: string, url: string, apiKey: string | undefined, model: string, messages: ChatMessage[], tools: any[], extraHeaders: Record<string, string> = {}) => {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`[${name}] API_KEY no configurada.`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.replace(/["']/g, "").trim()}`,
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => {
        const sanitized = { ...m };
        if (sanitized.role === 'assistant' && (sanitized as any).tool_calls) {
          sanitized.content = null as any;
        } else {
          sanitized.content = String(sanitized.content || "");
        }
        return sanitized;
      }),
      tools: tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })) : undefined
    })
  });

  if (!response.ok) {
    throw new Error(`[${name}] Falló: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.choices[0].message;
};

const providers: Record<string, LLMFetcher> = {
  groq: async (m, t) => {
    const response = await groq.chat.completions.create({
      model: config.GROQ_MODEL, messages: m as any,
      tools: t.length > 0 ? t.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) : undefined,
    });
    return response.choices[0].message;
  },
  openRouter: (m, t) => callOpenAICompatibleAPI('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', config.OPENROUTER_API_KEY, config.OPENROUTER_MODEL, m, t, { "HTTP-Referer": "https://github.com/cayetano/DeltaGravity", "X-Title": "DeltaGravity Agent" }),
  gemini: (m, t) => callOpenAICompatibleAPI('Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', config.GEMINI_API_KEY, config.GEMINI_MODEL, m, t),
  githubModels: (m, t) => callOpenAICompatibleAPI('GithubModels', 'https://models.inference.ai.azure.com/chat/completions', config.GITHUB_MODELS_API_KEY, config.GITHUB_MODEL, m, t),
  mistral: (m, t) => callOpenAICompatibleAPI('Mistral', 'https://api.mistral.ai/v1/chat/completions', config.MISTRAL_API_KEY, config.MISTRAL_MODEL, m, t),
  huggingface: (m, t) => callOpenAICompatibleAPI('HuggingFace', 'https://api-inference.huggingface.co/models/' + config.HUGGINGFACE_MODEL + '/v1/chat/completions', config.HUGGINGFACE_API_KEY, config.HUGGINGFACE_MODEL, m, t),
  cohere: (m, t) => callOpenAICompatibleAPI('Cohere', 'https://api.cohere.com/v1/chat/completions', config.COHERE_API_KEY, config.COHERE_MODEL, m, t)
};

const executeWaterfall = async (providerNames: string[], messages: ChatMessage[], tools: any[], taskType: string): Promise<any> => {
  let lastError: any = new Error("No hay proveedores configurados para esta tarea.");
  for (const name of providerNames) {
    if (providers[name]) {
      try {
        console.log(`[SmartRouter] [${taskType}] Intentando con ${name}...`);
        return await providers[name](messages, tools);
      } catch (err: any) {
        if (err.message && err.message.includes("no configurada")) {
          console.log(`[SmartRouter] Ssaltando ${name} (Falta API Key)`);
          continue;
        }
        console.warn(`[SmartRouter] ${name} falló o denegó (429). Pasando al siguiente. Error: ${err.message.substring(0, 100)}`);
        lastError = err;
      }
    }
  }
  throw lastError; // Lanza si todos fallaron
};

export const smartRouterCompletion = async (messages: ChatMessage[], tools: any[], isRetry: boolean = false): Promise<any> => {
  const totalChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
  if (totalChars > 25000 && !isRetry) {
    console.warn(`[SmartRouter] Contexto GIGANTE detectado. Previniendo fallo en Groq.`);
    return executeWaterfall(['gemini', 'openRouter', 'githubModels', 'cohere'], messages, tools, 'CONTEXTO LARGO');
  }

  let complexity: 'FACIL' | 'COMPLEJA' = 'FACIL';
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMessage && lastUserMessage.content) {
    complexity = await evaluateTaskComplexity(lastUserMessage.content);
  }

  if (complexity === 'COMPLEJA') {
    return executeWaterfall(['githubModels', 'openRouter', 'cohere', 'gemini'], messages, tools, 'TAREA COMPLEJA');
  } else {
    // Para FACIL, lanzamos la cascada desde lo más rápido a lo más seguro
    return executeWaterfall(['groq', 'mistral', 'huggingface', 'gemini', 'githubModels', 'openRouter'], messages, tools, 'TAREA FACIL');
  }
};

export const transcribeAudio = async (buffer: Buffer, filename: string = 'audio.ogg'): Promise<string> => {
  try {
    const file = await toFile(buffer, filename);
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: config.GROQ_AUDIO_MODEL,
    });
    return transcription.text;
  } catch (error) {
    console.error('Groq Audio Error:', error);
    throw error;
  }
};

// OpenRouter Fallback would be implemented here if needed.
// For now, focusing on the primary provider.

export const generateSpeech = async (text: string): Promise<Buffer> => {
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY no está configurada.');
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      }
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('ElevenLabs Error:', response.status, errorBody);
    throw new Error(`Failed to generate speech: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};
