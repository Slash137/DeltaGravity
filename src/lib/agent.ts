import { getGroqCompletion, ChatMessage } from './llm.js';
import { repository } from './database.js';
import { tools } from './tools.js';
import fs from 'fs';
import path from 'path';

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


export const runAgent = async (userId: number, userInput: string) => {
  const MAX_ITERATIONS = 5;
  const history = await repository.getMessages(userId);
  let currentMessages: ChatMessage[] = [
    { role: 'system', content: `You are DeltaGravity, a local AI assistant. You have full Text-To-Speech (TTS) capabilities enabled. If the user asks for a voice message, simply write the text you want to say, and the system WILL automatically convert your text into a voice message. NEVER say that you cannot generate audio or voice messages. You CAN speak. NEVER output function tags like <function=...> in your final response.\n${cachedSkillsPrompt}` } as ChatMessage,
    ...history.map((m: any) => ({ ...m, role: m.role as any })),
    { role: 'user', content: userInput } as ChatMessage,
  ];

  await repository.addMessage(userId, 'user', userInput);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await getGroqCompletion(currentMessages, Object.values(tools));

    if (response.tool_calls) {
      currentMessages.push(response as any);
      
      for (const toolCall of response.tool_calls) {
        const tool = tools[toolCall.function.name];
        if (tool) {
          console.log(`Executing tool: ${tool.name}`);
          let result: string;
          try {
            const args = JSON.parse(toolCall.function.arguments);
            let toolResult = await tool.handler(args);
            result = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          } catch (err: any) {
            console.error(`Error en tool ${tool.name}:`, err.message);
            result = `Error al ejecutar la herramienta: ${err.message}. Por favor revisa tus argumentos y reintentalo.`;
          }
          currentMessages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
            name: tool.name,
          } as any);
        }
      }
      continue;
    }

    if (response.content) {
      // Limpieza de posibles tags de herramientas que el modelo suelte en el texto por error
      const cleanContent = response.content.replace(/<function=.*?><\/function>/g, '').trim();
      
      if (cleanContent) {
        await repository.addMessage(userId, 'assistant', cleanContent);
        return cleanContent;
      }
    }
  }

  return "Perdona, he llegado al límite de pensamiento para esta consulta.";
};
