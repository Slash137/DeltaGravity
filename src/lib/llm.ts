import { config } from '../config.js';

type Content = any;

let connectorsInitialized = false;
const registeredConnectors = new Set<string>();

const loadOneRingAI = async (): Promise<any> => import('@everworker/oneringai');

const getOllamaOpenAIBaseUrl = (): string => {
  const trimmed = config.OLLAMA_BASE_URL.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
};

const connectorExists = (Connector: any, name: string): boolean => {
  if (registeredConnectors.has(name)) {
    return true;
  }

  if (typeof Connector?.exists === 'function') {
    try {
      return Boolean(Connector.exists(name));
    } catch {
      return false;
    }
  }

  if (typeof Connector?.get === 'function') {
    try {
      return Boolean(Connector.get(name));
    } catch {
      return false;
    }
  }

  if (typeof Connector?.list === 'function') {
    try {
      const connectors = Connector.list();
      if (Array.isArray(connectors)) {
        return connectors.some((connector: any) => connector?.name === name);
      }
    } catch {
      return false;
    }
  }

  return false;
};

const createConnectorIfNeeded = (Connector: any, definition: any) => {
  if (connectorExists(Connector, definition.name)) {
    registeredConnectors.add(definition.name);
    return;
  }

  try {
    Connector.create(definition);
  } catch (error: any) {
    const message = error?.message ?? '';
    const duplicateError =
      message.includes('already exists') ||
      message.includes('duplicate') ||
      message.includes('already registered');

    if (!duplicateError) {
      throw error;
    }
  }

  registeredConnectors.add(definition.name);
};

const initConnectors = async () => {
  if (connectorsInitialized) {
    return;
  }

  const { Connector, Vendor } = await loadOneRingAI();

  if (config.GROQ_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'groq',
      vendor: Vendor.Groq,
      auth: { type: 'api_key', apiKey: config.GROQ_API_KEY },
    });
  }
  if (config.GEMINI_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'gemini',
      vendor: Vendor.Google,
      auth: { type: 'api_key', apiKey: config.GEMINI_API_KEY },
    });
  }
  if (config.GITHUB_MODELS_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'githubModels',
      vendor: Vendor.OpenAI,
      auth: { type: 'api_key', apiKey: config.GITHUB_MODELS_API_KEY },
      baseURL: 'https://models.inference.ai.azure.com',
    });
  }
  if (config.OPENROUTER_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'openRouter',
      vendor: Vendor.OpenAI,
      auth: { type: 'api_key', apiKey: config.OPENROUTER_API_KEY },
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  if (config.MISTRAL_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'mistral',
      vendor: Vendor.Mistral,
      auth: { type: 'api_key', apiKey: config.MISTRAL_API_KEY },
    });
  }
  if (config.HUGGINGFACE_API_KEY) {
    createConnectorIfNeeded(Connector, {
      name: 'huggingface',
      vendor: Vendor.HuggingFace,
      auth: { type: 'api_key', apiKey: config.HUGGINGFACE_API_KEY },
    });
  }
  if (config.OLLAMA_BASE_URL) {
    createConnectorIfNeeded(Connector, {
      name: 'ollama',
      vendor: Vendor.OpenAI,
      auth: { type: 'api_key', apiKey: config.OLLAMA_API_KEY || 'ollama' },
      baseURL: getOllamaOpenAIBaseUrl(),
    });
  }

  connectorsInitialized = true;
};

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface SpeechResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

const getTTSTTBaseUrl = (): string | null => {
  const raw = config.TTSTT_BASE_URL?.trim();
  if (!raw) {
    return null;
  }

  return raw.replace(/\/+$/, '');
};

const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs: number = config.TTSTT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const canGenerateSpeech = (): boolean => Boolean(config.OPENAI_API_KEY || getTTSTTBaseUrl());

export const evaluateTaskComplexity = async (userMessage: string): Promise<'FACIL' | 'COMPLEJA'> => {
  try {
    await initConnectors();
    const { Agent } = await loadOneRingAI();
    const agent = Agent.create({ connector: 'groq', model: config.GROQ_ROUTER_MODEL });
    const response = await agent.run([
      { type: 'system', text: "Clasifica la siguiente tarea según su dificultad en una de estas palabras: FACIL o COMPLEJA. Responde SOLO la palabra. Buscar respuestas directas o saludos = FACIL. Crear código avanzado o estructuras = COMPLEJA." },
      { type: 'input_text', text: userMessage }
    ]);
    return response.output_text?.trim().toUpperCase() === 'COMPLEJA' ? 'COMPLEJA' : 'FACIL';
  } catch (err) {
    return 'FACIL';
  }
};

const executeWaterfall = async (providerNames: string[], messages: any[], tools: any[], taskType: string): Promise<any> => {
  let lastError: any = new Error("No hay proveedores configurados para esta tarea.");
  await initConnectors();
  const { Connector, Agent } = await loadOneRingAI();
  
  for (const name of providerNames) {
    if (connectorExists(Connector, name)) {
      try {
        console.log(`[SmartRouter] [${taskType}] Intentando con ${name}...`);
        const result = await runConnectorCompletion(name, resolveConnectorModel(name), messages, tools);
        
        if (result) {
          console.log(`[SmartRouter] ✅ Éxito con ${name}`);
          // Return format expected by agent.ts (OpenAI-like completion object)
          return {
            content: result.output_text,
            tool_calls: result.tool_calls
          };
        }
      } catch (err: any) {
        console.warn(`[SmartRouter] ❌ ${name}: ${err.message?.substring(0, 150)}`);
        lastError = err;
      }
    }
  }
  
  throw lastError;
};

const resolveConnectorModel = (name: string): string => {
  if (name === 'gemini') return config.GEMINI_MODEL;
  if (name === 'githubModels') return config.GITHUB_MODEL;
  if (name === 'mistral') return config.MISTRAL_MODEL;
  if (name === 'openRouter') return config.OPENROUTER_MODEL;
  if (name === 'huggingface') return config.HUGGINGFACE_MODEL;
  if (name === 'ollama') return config.OLLAMA_MODEL;
  return config.GROQ_MODEL;
};

const toOneRingContent = (messages: any[]): Content[] =>
  messages.map((m) => {
    if (m.role === 'system') return { type: 'system', text: m.content };
    if (m.role === 'assistant') {
      return {
        type: 'output_text',
        text: m.content || "",
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {})
      };
    }
    if (m.role === 'tool') {
      return {
        type: 'tool_response',
        tool_call_id: m.tool_call_id,
        name: m.name,
        content: m.content
      };
    }
    return { type: 'input_text', text: m.content };
  });

export const runConnectorCompletion = async (
  connectorName: string,
  model: string,
  messages: ChatMessage[],
  tools: any[],
): Promise<any> => {
  await initConnectors();
  const { Connector, Agent } = await loadOneRingAI();

  if (!connectorExists(Connector, connectorName)) {
    throw new Error(`El conector ${connectorName} no está configurado.`);
  }

  const agent = Agent.create({
    connector: connectorName,
    model,
    tools: tools.map(t => ({
      definition: {
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      },
      execute: t.handler
    }))
  });

  return agent.run(toOneRingContent(messages));
};

export const smartRouterCompletion = async (messages: ChatMessage[], tools: any[], isRetry: boolean = false): Promise<any> => {
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

const transcribeAudioWithTTSTT = async (buffer: Buffer, filename: string): Promise<string> => {
  const baseUrl = getTTSTTBaseUrl();
  if (!baseUrl) {
    throw new Error('STT fallback no disponible: falta TTSTT_BASE_URL.');
  }

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)]), filename);
  const response = await fetchWithTimeout(`${baseUrl}/stt`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`TTSTT STT error ${response.status}: ${errorText}`);
  }

  const data = await response.json().catch(() => null) as { text?: string } | null;
  const text = data?.text?.trim();
  if (!text) {
    throw new Error('TTSTT STT devolvió una transcripción vacía.');
  }

  return text;
};

export const transcribeAudio = async (buffer: Buffer, filename: string = 'audio.ogg'): Promise<string> => {
  if (!config.OPENAI_API_KEY) {
    return transcribeAudioWithTTSTT(buffer, filename);
  }

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)]), filename);
  formData.append('model', config.OPENAI_TRANSCRIBE_MODEL);
  formData.append('response_format', 'text');

  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI STT error ${response.status}: ${errorText}`);
    }

    return (await response.text()).trim();
  } catch (error) {
    const baseUrl = getTTSTTBaseUrl();
    if (!baseUrl) {
      throw error;
    }

    console.warn('OpenAI STT falló. Usando TTSTT fallback.', error);
    return transcribeAudioWithTTSTT(buffer, filename);
  }
};

const generateSpeechWithTTSTT = async (text: string): Promise<SpeechResult> => {
  const baseUrl = getTTSTTBaseUrl();
  if (!baseUrl) {
    throw new Error('TTS fallback no disponible: falta TTSTT_BASE_URL.');
  }

  const response = await fetchWithTimeout(`${baseUrl}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`TTSTT TTS error ${response.status}: ${errorText}`);
  }

  const audioArrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type') || 'audio/wav';
  const filename = mimeType.includes('mpeg') ? 'delta-response.mp3' : 'delta-response.wav';
  return {
    buffer: Buffer.from(audioArrayBuffer),
    filename,
    mimeType,
  };
};

export const generateSpeech = async (text: string): Promise<SpeechResult> => {
  if (!config.OPENAI_API_KEY) {
    return generateSpeechWithTTSTT(text);
  }

  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.OPENAI_TTS_MODEL,
        voice: config.OPENAI_TTS_VOICE,
        input: text,
        format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI TTS error ${response.status}: ${errorText}`);
    }

    const audioArrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(audioArrayBuffer),
      filename: 'delta-response.mp3',
      mimeType: 'audio/mpeg',
    };
  } catch (error) {
    const baseUrl = getTTSTTBaseUrl();
    if (!baseUrl) {
      throw error;
    }

    console.warn('OpenAI TTS falló. Usando TTSTT fallback.', error);
    return generateSpeechWithTTSTT(text);
  }
};
