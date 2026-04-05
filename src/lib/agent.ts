import { OpenAI } from 'openai';
import { repository } from './database.js';
import { tools } from './tools.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { getLaunchProfile } from './launch-profiles.js';
import { buildDeltaSystemPrompt } from './persona.js';

// --- Skills loader ---
const loadSkillsRecursively = (dir: string, currentPrompt: string = ''): string => {
  let prompt = currentPrompt;
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const dirent of files) {
      const fullPath = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        prompt = loadSkillsRecursively(fullPath, prompt);
      } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        console.log(`[Skills] Loaded skill doc: ${dirent.name} (${content.length} chars)`);
        prompt += `\n\n--- HABILIDAD ADICIONAL: ${dirent.name} ---\n${content}\n`;
      }
    }
  }
  return prompt;
};

const skillsPath = path.join(process.cwd(), 'src', 'skills');
const cachedSkillsPrompt = loadSkillsRecursively(skillsPath);

// --- OpenAI-compatible client pointing to Ollama ---
const ollamaClient = new OpenAI({
  baseURL: `${config.OLLAMA_BASE_URL.replace(/\/+$/, '')}/v1`,
  apiKey: config.OLLAMA_API_KEY || 'ollama',
  timeout: 240_000, // 4 minutos para modelos locales lentos
});

// --- Build OpenAI-format tool definitions from our tools record ---
const buildToolDefinitions = (): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  return Object.values(tools).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
};

// --- Execute a single tool call ---
const executeTool = async (name: string, argsString: string): Promise<string> => {
  const tool = tools[name];
  if (!tool) {
    return `Error: herramienta "${name}" no encontrada.`;
  }

  let args: any = {};
  try {
    args = JSON.parse(argsString);
  } catch {
    return `Error: argumentos inválidos para "${name}": ${argsString}`;
  }

  try {
    console.log(`[Tool] Ejecutando: ${name}(${JSON.stringify(args).substring(0, 200)})`);
    const result = await tool.handler(args);
    console.log(`[Tool] ${name} completado (${result.length} chars)`);
    return result;
  } catch (err: any) {
    console.error(`[Tool] Error en ${name}:`, err);
    return `Error ejecutando ${name}: ${err.message}`;
  }
};

// --- Core agent runner using direct Ollama/OpenAI API ---
const runOllamaAgent = async (
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> => {
  const toolDefs = buildToolDefinitions();
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ollamaClient.chat.completions.create({
      model,
      messages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('Ollama no devolvió ninguna opción de respuesta.');
    }

    const assistantMessage = choice.message;

    // If the model wants to call tools, execute them and loop back
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add the assistant message with tool_calls to the conversation
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type === 'function') {
          const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }

      // Continue the loop — the model will see the tool results and respond
      continue;
    }

    // No tool calls — return the text response
    const content = assistantMessage.content?.trim();
    if (content) {
      return content;
    }

    throw new Error('Ollama devolvió una respuesta vacía.');
  }

  throw new Error('Se alcanzó el límite de rondas de herramientas sin respuesta final.');
};

// --- Public API ---
export const runAgent = async (contextKey: string, userInput: string) => {
  return runAgentWithProgress(contextKey, userInput);
};

export const runAgentWithProgress = async (
  contextKey: string,
  userInput: string,
  onProgress?: (snapshot: {
    status: string;
    partialText?: string;
    currentTool?: string;
    recentTools?: string[];
    planItems?: string[];
  }) => void,
  signal?: AbortSignal,
) => {
  const history = await repository.getContextMessages(contextKey);
  const settings = await repository.getContextAgentSettings(contextKey);
  const launchProfile = getLaunchProfile(settings.launchProfile);
  const codexModel = settings.codexModel || launchProfile?.codexModel || config.OLLAMA_MODEL;

  const systemPrompt = buildDeltaSystemPrompt(cachedSkillsPrompt);

  // Build the messages array in OpenAI chat format
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userInput },
  ];

  // Persist the user message
  await repository.addContextMessage(contextKey, 'user', userInput);
  await repository.updateContextAgentSettings(contextKey, {
    ...settings,
    backend: 'ollama',
    lastPrompt: userInput,
    codexModel,
    codexReasoningEffort: undefined,
    codexSessionId: undefined,
    launchProfile: settings.launchProfile,
  });

  try {
    onProgress?.({ status: 'Usando backend Ollama' });
    const result = await runOllamaAgent(codexModel, messages);
    await repository.addContextMessage(contextKey, 'assistant', result);
    return result;
  } catch (err: any) {
    console.error('Error in runAgent with Ollama:', err);
    return `Creador, Ollama ha fallado: ${err.message}`;
  }
};
