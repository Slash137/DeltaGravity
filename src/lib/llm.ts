import { config } from '../config.js';
import { Connector, Agent, Vendor, Services, TextToSpeech, SpeechToText, type Content, type IToolRuntime } from '@everworker/oneringai';

// Initialize OneRingAI Connectors
const initConnectors = () => {
  if (config.GROQ_API_KEY) {
    Connector.create({
      name: 'groq',
      vendor: Vendor.Groq,
      auth: { type: 'api_key', apiKey: config.GROQ_API_KEY },
    });
  }
  if (config.GEMINI_API_KEY) {
    Connector.create({
      name: 'gemini',
      vendor: Vendor.Google,
      auth: { type: 'api_key', apiKey: config.GEMINI_API_KEY },
    });
  }
  if (config.GITHUB_MODELS_API_KEY) {
    // Github Models is often OpenAI-compatible, we can use a custom base URL with OpenAI vendor if not directly supported
    Connector.create({
      name: 'githubModels',
      vendor: Vendor.OpenAI,
      auth: { type: 'api_key', apiKey: config.GITHUB_MODELS_API_KEY },
      baseURL: 'https://models.inference.ai.azure.com',
    });
  }
  if (config.OPENROUTER_API_KEY) {
    Connector.create({
      name: 'openRouter',
      vendor: Vendor.OpenRouter,
      auth: { type: 'api_key', apiKey: config.OPENROUTER_API_KEY },
    });
  }
  if (config.MISTRAL_API_KEY) {
    Connector.create({
      name: 'mistral',
      vendor: Vendor.Mistral,
      auth: { type: 'api_key', apiKey: config.MISTRAL_API_KEY },
    });
  }
  if (config.HUGGINGFACE_API_KEY) {
    Connector.create({
      name: 'huggingface',
      vendor: Vendor.HuggingFace,
      auth: { type: 'api_key', apiKey: config.HUGGINGFACE_API_KEY },
    });
  }
};

initConnectors();

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export const evaluateTaskComplexity = async (userMessage: string): Promise<'FACIL' | 'COMPLEJA'> => {
  try {
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
  
  for (const name of providerNames) {
    if (Connector.exists(name)) {
      try {
        console.log(`[SmartRouter] [${taskType}] Intentando con ${name}...`);
        
        // Map the model name based on provider
        let model = config.GROQ_MODEL;
        if (name === 'gemini') model = config.GEMINI_MODEL;
        if (name === 'githubModels') model = config.GITHUB_MODEL;
        if (name === 'mistral') model = config.MISTRAL_MODEL;
        if (name === 'openRouter') model = config.OPENROUTER_MODEL;
        if (name === 'huggingface') model = config.HUGGINGFACE_MODEL;

        const agent = Agent.create({ 
          connector: name, 
          model: model,
          tools: tools.map(t => ({
            definition: {
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters }
            },
            execute: t.handler
          }))
        });

        // Convert messages to OneRingAI Content format
        const content: Content[] = messages.map(m => {
          if (m.role === 'system') return { type: 'system', text: m.content };
          if (m.role === 'assistant' && m.tool_calls) {
             return { 
               type: 'output_text', 
               text: m.content || "", 
               tool_calls: m.tool_calls 
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

        const result = await agent.run(content);
        
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

export const transcribeAudio = async (buffer: Buffer, filename: string = 'audio.ogg'): Promise<string> => {
  try {
    const stt = SpeechToText.create({ connector: 'groq', model: config.GROQ_AUDIO_MODEL });
    const result = await stt.transcribe(buffer, { filename });
    return result.text;
  } catch (error) {
    console.error('OneRingAI STT Error:', error);
    throw error;
  }
};

export const generateSpeech = async (text: string): Promise<Buffer> => {
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY no está configurada.');
  }

  try {
    // If ElevenLabs is used, we might need a connector for it. 
    // OneRingAI supports ElevenLabs if registered as a Service.
    if (!Connector.exists('elevenlabs')) {
      Connector.create({
        name: 'elevenlabs',
        serviceType: Services.ElevenLabs,
        auth: { type: 'api_key', apiKey: config.ELEVENLABS_API_KEY },
      });
    }

    const tts = TextToSpeech.create({ 
      connector: 'elevenlabs', 
      model: 'eleven_multilingual_v2', 
      voice: config.ELEVENLABS_VOICE_ID 
    });
    return await tts.generate(text);
  } catch (error) {
    console.error('OneRingAI TTS Error:', error);
    throw error;
  }
};

