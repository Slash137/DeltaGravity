import Groq, { toFile } from 'groq-sdk';
import { config } from '../config.js';

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export const getGroqCompletion = async (messages: ChatMessage[], tools: any[], isRetry: boolean = false): Promise<any> => {
  // 1. Detección Inteligente: Si el contexto es enorme (> 10k tokens aprox), vamos directo a OpenRouter
  // Estimación rápida: 1 token ~ 4 caracteres. 10k tokens ~ 40k caracteres.
  const totalChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
  const estimatedTokens = totalChars / 4;
  
  const shouldSkipGroq = estimatedTokens > 10000;

  if (shouldSkipGroq && !isRetry) {
    console.warn(`[SmartSelection] Contexto grande detected (~${Math.round(estimatedTokens)} tokens). Saltando directamente a OpenRouter...`);
    return callOpenRouter(messages, tools, "Contexto demasiado grande para Groq Free");
  }

  try {
    const response = await groq.chat.completions.create({
      model: config.GROQ_MODEL,
      messages: messages as any,
      tools: tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }
      })) : undefined,
    });

    return response.choices[0].message;
  } catch (error: any) {
    console.warn(`Groq Error (${error.status || error.name}): Límite excedido o error. Usando OpenRouter de rescate...`);
    return callOpenRouter(messages, tools, error);
  }
};

const callOpenRouter = async (messages: ChatMessage[], tools: any[], originalError: any) => {
  const apiKey = config.OPENROUTER_API_KEY?.replace(/["']/g, "").trim();
  
  if (!apiKey) {
    console.error('No hay OPENROUTER_API_KEY configurada para el rescate.');
    throw originalError;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/cayetano/DeltaGravity", // Requerido por algunos modelos
        "X-Title": "DeltaGravity Agent"
      },
      body: JSON.stringify({
        model: config.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
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
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          }
        })) : undefined
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter Fallback Failed: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message;
  } catch (fallbackError) {
    console.error('Error en el Fallback de OpenRouter:', fallbackError);
    throw originalError;
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
