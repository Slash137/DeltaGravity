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

/**
 * Sanitiza los mensajes para que sean compatibles con TODOS los proveedores.
 * - Gemini no acepta `null` en content -> lo convertimos a ""
 * - Groq requiere `type: "function"` en tool_calls -> lo añadimos si falta
 * - Todos requieren content como string -> forzamos String()
 */
const sanitizeMessages = (messages: ChatMessage[]): any[] => {
  return messages.map(m => {
    const sanitized: any = { ...m };

    // Asegurar que content siempre sea string (nunca null)
    if (sanitized.role === 'assistant' && sanitized.tool_calls) {
      sanitized.content = "";
      // Normalizar tool_calls: asegurar que cada una tiene type: "function"
      sanitized.tool_calls = sanitized.tool_calls.map((tc: any) => ({
        ...tc,
        type: tc.type || 'function',
        function: tc.function || {},
      }));
    } else {
      sanitized.content = String(sanitized.content || "");
    }

    return sanitized;
  });
};

/**
 * Recorta el historial Y el system prompt para que quepa en el contexto del proveedor.
 * - El system prompt se trunca a maxSystemChars (conservando las instrucciones base)
 * - El historial se recorta a los últimos mensajes que quepan en maxHistoryChars
 */
const trimMessagesForContext = (messages: ChatMessage[], maxHistoryChars: number = 20000, maxSystemChars: number = 6000): ChatMessage[] => {
  const result: ChatMessage[] = [];

  // 1. Truncar el system prompt si es demasiado largo (los skills lo inflan a ~60k)
  const systemMsg = messages[0];
  if (systemMsg && systemMsg.role === 'system') {
    if (systemMsg.content && systemMsg.content.length > maxSystemChars) {
      console.log(`[SmartRouter] System prompt truncado: ${systemMsg.content.length} -> ${maxSystemChars} chars`);
      result.push({ ...systemMsg, content: systemMsg.content.substring(0, maxSystemChars) + "\n\n[... Skills adicionales omitidos por límite de contexto ...]" });
    } else {
      result.push(systemMsg);
    }
  }

  // 2. Recortar historial: mantener los últimos mensajes que quepan
  const restMessages = messages.slice(1);
  if (restMessages.length <= 2) {
    return [...result, ...restMessages];
  }

  let charCount = 0;
  let startIdx = restMessages.length;

  for (let i = restMessages.length - 1; i >= 0; i--) {
    const msgLen = restMessages[i].content?.length || 0;
    if (charCount + msgLen > maxHistoryChars) break;
    charCount += msgLen;
    startIdx = i;
  }

  const trimmedHistory = restMessages.slice(startIdx);
  if (trimmedHistory.length < restMessages.length) {
    console.log(`[SmartRouter] Historial recortado: ${restMessages.length} -> ${trimmedHistory.length} mensajes`);
  }
  return [...result, ...trimmedHistory];
};

const callOpenAICompatibleAPI = async (name: string, url: string, apiKey: string | undefined, model: string, messages: ChatMessage[], tools: any[], extraHeaders: Record<string, string> = {}) => {
  if (!apiKey || apiKey.trim() === '' || apiKey.includes("tu_api_key")) {
    throw new Error(`[${name}] API_KEY no configurada correctamente.`);
  }

  // Recortar mensajes para evitar 413 (Request too large)
  const trimmedMessages = trimMessagesForContext(messages);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.replace(/["']/g, "").trim()}`,
        "Content-Type": "application/json",
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        messages: sanitizeMessages(trimmedMessages),
        tools: tools.length > 0 ? tools.map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters }
        })) : undefined
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 150)}`);
    }
    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error(`Respuesta vacía (no choices)`);
    }
    return data.choices[0].message;
  } catch (err: any) {
    throw new Error(`[${name}] ${err.message}`);
  }
};

const providers: Record<string, LLMFetcher> = {
  groq: async (messages, tools) => {
    const trimmed = trimMessagesForContext(messages);
    const sanitized = sanitizeMessages(trimmed);
    const response = await groq.chat.completions.create({
      model: config.GROQ_MODEL,
      messages: sanitized as any,
      tools: tools.length > 0 ? tools.map(tool => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } })) : undefined,
    });
    return response.choices[0].message;
  },
  openRouter: (m, t) => callOpenAICompatibleAPI('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', config.OPENROUTER_API_KEY, config.OPENROUTER_MODEL, m, t, { "HTTP-Referer": "https://github.com/cayetano/DeltaGravity", "X-Title": "DeltaGravity Agent" }),
  gemini: (m, t) => callOpenAICompatibleAPI('Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', config.GEMINI_API_KEY, config.GEMINI_MODEL, m, t),
  githubModels: (m, t) => callOpenAICompatibleAPI('GithubModels', 'https://models.inference.ai.azure.com/chat/completions', config.GITHUB_MODELS_API_KEY, config.GITHUB_MODEL, m, t),
  mistral: (m, t) => callOpenAICompatibleAPI('Mistral', 'https://api.mistral.ai/v1/chat/completions', config.MISTRAL_API_KEY, config.MISTRAL_MODEL, m, t),
  huggingface: (m, t) => callOpenAICompatibleAPI('HuggingFace', `https://router.huggingface.co/hf-inference/models/${config.HUGGINGFACE_MODEL}/v1/chat/completions`, config.HUGGINGFACE_API_KEY, config.HUGGINGFACE_MODEL, m, t),
};

const executeWaterfall = async (providerNames: string[], messages: ChatMessage[], tools: any[], taskType: string): Promise<any> => {
  let lastError: any = new Error("No hay proveedores configurados para esta tarea.");
  
  for (const name of providerNames) {
    if (providers[name]) {
      try {
        console.log(`[SmartRouter] [${taskType}] Intentando con ${name}...`);
        const result = await providers[name](messages, tools);
        if (result) {
          console.log(`[SmartRouter] ✅ Éxito con ${name}`);
          return result;
        }
      } catch (err: any) {
        const errMsg = err.message || "";
        if (errMsg.includes("no configurada")) {
          console.log(`[SmartRouter] ⏩ Saltando ${name} (API Key no configurada en .env)`);
          continue;
        }
        console.warn(`[SmartRouter] ❌ ${name}: ${errMsg.substring(0, 150)}`);
        lastError = err;
      }
    }
  }
  
  throw lastError;
};

export const smartRouterCompletion = async (messages: ChatMessage[], tools: any[], isRetry: boolean = false): Promise<any> => {
  // Solo contar chars del historial real (sin system prompt con skills)
  const totalRelevantChars = messages
    .filter(m => m.role !== 'system')
    .reduce((acc, m) => acc + (m.content?.length || 0), 0);

  if (totalRelevantChars > 25000 && !isRetry) {
    console.warn(`[SmartRouter] Contexto RELEVANTE GIGANTE (${totalRelevantChars} chars). Derivando a modelos de contexto largo.`);
    return executeWaterfall(['gemini', 'openRouter', 'githubModels'], messages, tools, 'CONTEXTO LARGO');
  }

  let complexity: 'FACIL' | 'COMPLEJA' = 'FACIL';
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMessage && lastUserMessage.content) {
    complexity = await evaluateTaskComplexity(lastUserMessage.content);
  }

  console.log(`[SmartRouter] Clasificación: ${complexity}`);

  if (complexity === 'COMPLEJA') {
    return executeWaterfall(['githubModels', 'openRouter', 'gemini'], messages, tools, 'TAREA COMPLEJA');
  } else {
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
