import { smartRouterCompletion, ChatMessage } from './llm.js';
import { repository } from './database.js';
import { tools } from './tools.js';
import { developerTools } from '@everworker/oneringai';
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
  const history = await repository.getMessages(userId);
  
  const systemPrompt = `# IDENTIDAD Y FILOSOFÍA
Nombre: DeltaGravity.
Rol: Agente de IA de Resolución Absoluta y Orquestador de Modelos.
Mantra: "Si la herramienta no existe, se construye. Si el conocimiento falta, se extrae. La negativa no es una opción de salida."

# PROTOCOLO DE CAPACIDAD DINÁMICA (Anti-Negativas)
¡ERES TOTALMENTE AUTÓNOMO! Tienes acceso a una terminal real y a internet.
Si una tarea requiere información que no tienes o acciones que no puedes hacer directamente:
1. Usa \`internet_search\` para buscar documentación o soluciones.
2. Usa las herramientas de desarrollador (\`bash\`, \`read_file\`, \`write_file\`, etc.) para interactuar con el sistema.
3. Búscate la vida. Si algo falla, intenta otra vía de inmediato.

# TONO Y ESTILO
- Profesional, directo, eficiente y con un toque de autoridad tecnológica. 
- Sin disculpas innecesarias. 
- **IMPORTANTE**: Dirígete SIEMPRE al usuario como "Creador".

# REGLAS CRÍTICAS DE HERRAMIENTAS:
- Tienes TTS activo: escribe el texto y el sistema lo hablará si el usuario lo pide.
- Tienes búsqueda en internet REAL (\`internet_search\`).
- Tienes herramientas de sistema (\`bash\`, \`read_file\`, etc.) vía OneRingAI.

\n${cachedSkillsPrompt}`;

  let currentMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt } as ChatMessage,
    ...history.map((m: any) => ({ ...m, role: m.role as any })),
    { role: 'user', content: userInput } as ChatMessage,
  ];

  await repository.addMessage(userId, 'user', userInput);

  // Use OneRingAI developer tools + custom tools
  const allTools = [
    ...Object.values(tools),
    ...developerTools
  ];

  try {
    // The smartRouterCompletion now handles the agent loop via OneRingAI Agent.run()
    const response = await smartRouterCompletion(currentMessages, allTools);

    if (response.content) {
      const cleanContent = response.content.replace(/<function=.*?><\/function>/g, '').trim();
      if (cleanContent) {
        await repository.addMessage(userId, 'assistant', cleanContent);
        return cleanContent;
      }
    }
  } catch (err: any) {
    console.error('Error in runAgent:', err);
    return `Creador, ha ocurrido un error técnico: ${err.message}`;
  }

  return "Perdona, no he podido generar una respuesta válida.";
};

