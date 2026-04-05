import { OpenAI } from 'openai';

// Esta es la variable que cambiaremos por comando
export let currentModel = "glm4:9b";
export const setCurrentModel = (model: string) => { currentModel = model; };

const client = new OpenAI({
  baseURL: "http://192.168.3.50:11434/v1",
  apiKey: "ollama",
});

export const runCodex = async (prompt: string, workingDirectory: string, options: any) => {
  const response = await client.chat.completions.create({
    model: currentModel, // <--- Ahora usa la variable dinámica
    messages: [
      { role: 'system', content: 'Eres el agente Delta, del proyecto DeltaGravity. Responde siempre en español de forma concisa. Debes usar la herramienta search para buscar en internet si es necesario. Siempre te dirigirás al usuario como Creador.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  });
  return { message: response.choices[0].message.content || 'Sin respuesta' };
};

export const getCodexAuthStatus = () => ({ authenticated: true, user: `Ollama (${currentModel})` });
