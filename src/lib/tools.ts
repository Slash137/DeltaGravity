import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export interface Tool {
  name: string;
  description: string;
  parameters: object;
  handler: (args: any) => Promise<string>;
}

const customToolsPath = path.join(process.cwd(), 'src', 'custom_tools');
if (!fs.existsSync(customToolsPath)) {
  fs.mkdirSync(customToolsPath, { recursive: true });
}

export const tools: Record<string, Tool> = {
  get_current_time: {
    name: 'get_current_time',
    description: 'Returns the current local time.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      return new Date().toLocaleString();
    },
  },
  create_tool: {
    name: 'create_tool',
    description: 'Crea, guarda y carga una nueva herramienta TypeScript que podras usar al instante. Usa esto cuando el usuario te pida algo que no sabes hacer. El codigo debe exportar por defecto un objeto que cumpla la interfaz { name, description, parameters, handler }. NO USAR AXIOS (no disponible), usa `fetch` nativo. Tu output (code) DEBE SER CODIGO TS VALIDO Y COMPLETO sin estar envuelto en markdown strings al enviarlo al argumento.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la herramienta en snake_case' },
        code: { type: 'string', description: 'El codigo TypeScript o Javascript. Exporta siempre con `export default { name: "...", description: "...", parameters: { type: "object", properties: {...} }, handler: async (args: any) => { ... } };`' }
      },
      required: ['name', 'code']
    },
    handler: async ({ name, code }: { name: string, code: string }) => {
      // Clean potential markdown blocks passed inside the code argument
      const cleanCode = code.replace(/^```(typescript|ts|javascript|js)?\n/m, '').replace(/\n```$/m, '');
      const filePath = path.join(customToolsPath, `${name}.ts`);
      
      fs.writeFileSync(filePath, cleanCode);
      
      try {
        // Dynamic import con URL absoluta (evita bugs de imports relativos en ESM) y cache busting
        const fileUrl = pathToFileURL(filePath).href;
        const mod = await import(`${fileUrl}?t=${Date.now()}`);
        const newTool = mod.default;

        if (newTool && newTool.name && newTool.handler) {
          tools[newTool.name] = newTool;
          return `Exito: La herramienta ${newTool.name} fue compilada y guardada en memoria. Ahora la puedes usar en tus proximos mensajes. Description: ${newTool.description}`;
        } else {
          return `Error: El archivo se guardó pero no contiene el "export default { name, description, parameters, handler }" necesario. Rehazlo corrigiendo la sintaxis.`;
        }
      } catch (e: any) {
        return `Error fatal de compilacion al importar la herramienta: ${e.message}\nCorrige el codigo e intentalo de nuevo.`;
      }
    }
  }
};

const loadCustomTools = async () => {
  if (fs.existsSync(customToolsPath)) {
    const files = fs.readdirSync(customToolsPath).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      try {
        const filePath = path.join(customToolsPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        const mod = await import(fileUrl);
        if (mod.default && mod.default.name) {
          tools[mod.default.name] = mod.default;
          console.log(`Loaded custom tool: ${mod.default.name}`);
        }
      } catch (e) {
        console.error(`Failed to load custom tool ${file}:`, e);
      }
    }
  }
};

import { loadMCPTools } from './mcp.js';
await loadCustomTools();
await loadMCPTools(tools);
