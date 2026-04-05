import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export interface Tool {
  name: string;
  description: string;
  parameters: object;
  handler: (args: any) => Promise<string>;
}

const sourceCustomToolsPath = path.join(process.cwd(), 'src', 'custom_tools');
const compiledCustomToolsPath = path.join(process.cwd(), 'dist', 'custom_tools');

for (const toolsPath of [sourceCustomToolsPath, compiledCustomToolsPath]) {
  if (!fs.existsSync(toolsPath)) {
    fs.mkdirSync(toolsPath, { recursive: true });
  }
}

const importToolModule = async (filePath: string) => {
  const fileUrl = pathToFileURL(filePath).href;
  return import(`${fileUrl}?update=${Date.now()}`);
};

const transpileToolToRuntime = async (name: string, code: string) => {
  const ts = await import('typescript');
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      esModuleInterop: true,
    },
    fileName: `${name}.ts`,
    reportDiagnostics: true,
  });

  const diagnostics = result.diagnostics ?? [];
  const errors = diagnostics
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const runtimePath = path.join(compiledCustomToolsPath, `${name}.js`);
  fs.writeFileSync(runtimePath, result.outputText, 'utf8');
  return runtimePath;
};

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
      const filePath = path.join(sourceCustomToolsPath, `${name}.ts`);
      
      fs.writeFileSync(filePath, cleanCode);
      
      try {
        const runtimePath = await transpileToolToRuntime(name, cleanCode);
        const absolutePath = path.resolve(runtimePath);
        const mod = await importToolModule(absolutePath);
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
  },
  execute_command: {
    name: 'execute_command',
    description: 'Ejecuta un comando en la terminal (bash/shell). Úsalo para instalar dependencias, correr scripts de python/node, buscar archivos, o hacer cualquier tarea que requiera la línea de comandos para cumplir con el objetivo del usuario. El output será el stdout/stderr del comando.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'El comando de shell a ejecutar (ej. "npm install axios", "python3 script.py", "ls -l")' }
      },
      required: ['command']
    },
    handler: async ({ command }: { command: string }) => {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);
      
      try {
        console.log(`[Tool] Ejecutando comando: ${command}`);
        const { stdout, stderr } = await execPromise(command, { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 5 });
        if (stderr && !stdout) {
           return `Ejecución completada con salida en stderr (puede ser info o warning):\n${stderr.substring(0, 4000)}`;
        }
        return `Salida del comando:\n${stdout.substring(0, 4000)}${stderr ? `\nErrores/Warnings:\n${stderr.substring(0, 4000)}` : ''}`;
      } catch (error: any) {
        return `Falló el comando. Código de salida: ${error.code}\nOutput de error:\n${error.message.substring(0, 4000)}`;
      }
    }
  }
};

const loadCustomTools = async () => {
  const runtimeFiles = fs.existsSync(compiledCustomToolsPath)
    ? fs.readdirSync(compiledCustomToolsPath).filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs'))
    : [];

  if (runtimeFiles.length > 0) {
    for (const file of runtimeFiles) {
      try {
        const filePath = path.join(compiledCustomToolsPath, file);
        const mod = await importToolModule(filePath);
        if (mod.default && mod.default.name) {
          tools[mod.default.name] = mod.default;
          console.log(`Loaded custom tool: ${mod.default.name}`);
        }
      } catch (e) {
        console.error(`Failed to load custom tool ${file}:`, e);
      }
    }
    return;
  }

  if (fs.existsSync(sourceCustomToolsPath)) {
    const files = fs.readdirSync(sourceCustomToolsPath).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'));
    for (const file of files) {
      try {
        const filePath = path.join(sourceCustomToolsPath, file);
        const mod = await importToolModule(filePath);
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
