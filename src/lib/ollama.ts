import { OpenAI } from 'openai';
import { config } from '../config.js';
import internetSearchTool from '../custom_tools/internet_search.js';

const client = new OpenAI({
  baseURL: `${config.OLLAMA_BASE_URL}/v1`,
  apiKey: config.OLLAMA_API_KEY || "ollama",
});

const tools = [
  {
    type: "function" as const,
    function: {
      name: internetSearchTool.name,
      description: internetSearchTool.description,
      parameters: internetSearchTool.parameters
    }
  }
];

export const runOllama = async (prompt: string, workingDirectory: string, options: any) => {
  const messages: any[] = [
    { role: 'system', content: 'Eres DeltaGravity, un asistente avanzado. Responde en español.\nTienes acceso a buscar en internet mediante la herramienta configurada. Úsala libremente si te preguntan por información reciente, noticias, datos en tiempo real o cualquier cosa que desconozcas.' },
    { role: 'user', content: prompt }
  ];

  let response = await client.chat.completions.create({
    model: config.OLLAMA_MODEL,
    messages,
    tools,
  });

  let message = response.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    messages.push(message);
    
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === "function" && toolCall.function.name === internetSearchTool.name) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error("Error parseando args del toolCall:", e);
        }
        
        try {
          const result = await internetSearchTool.handler(args);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: internetSearchTool.name,
            content: result
          });
        } catch (e) {
          console.error("Error ejecutando search tool:", e);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: internetSearchTool.name,
            content: "Error al realizar la búsqueda."
          });
        }
      }
    }
    
    // Segunda llamada para presentar los resultados de la herramienta al usuario
    response = await client.chat.completions.create({
      model: config.OLLAMA_MODEL,
      messages,
      tools,
    });
    
    message = response.choices[0].message;
  }

  return { message: message.content || 'Sin respuesta' };
};

export const getOllamaAuthStatus = () => ({ authenticated: true, user: 'Usuario-Local' });

export interface OllamaRunResult { message: string; }
