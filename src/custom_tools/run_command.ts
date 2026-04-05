import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_OUTPUT_LENGTH = 3000;
const TIMEOUT_MS = 30_000; // 30 segundos max por comando
const WORKING_DIR = process.env.HOME || '/home/cayetano';

// Comandos peligrosos que requieren confirmación explícita
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/i,    // rm -rf en raíz o home
  /\bmkfs\b/i,               // formatear discos
  /\bdd\s+if=/i,             // escritura directa a disco
  />\s*\/dev\//i,            // escribir a dispositivos
  /\bshutdown\b/i,           // apagar
  /\breboot\b/i,             // reiniciar
  /\bsystemctl\s+(stop|disable|mask)\s+(docker|ssh|network)/i,
];

export default {
  name: "run_command",
  description: `Ejecuta un comando de terminal en el PC Linux del Creador. Devuelve la salida estándar y errores del comando.

Usos: gestión de archivos, administración del sistema, git, docker, npm, python, comprobar estado del sistema, instalar paquetes, ejecutar scripts, etc.

El directorio de trabajo por defecto es el home del usuario.
Timeout: 30 segundos. Para procesos largos, usa '&' o 'nohup'.

IMPORTANTE: Siempre explica al Creador qué comando vas a ejecutar y por qué ANTES de ejecutarlo. Si el comando puede ser destructivo, pide confirmación.`,
  parameters: {
    type: "object",
    properties: {
      command: { 
        type: "string", 
        description: "Comando de shell a ejecutar (ej: 'ls -la', 'df -h', 'docker ps')" 
      },
      working_directory: { 
        type: "string", 
        description: "Directorio de trabajo (opcional, por defecto el home del usuario)" 
      }
    },
    required: ["command"]
  },
  handler: async (args: any) => {
    const command = args.command?.trim();
    const cwd = args.working_directory || WORKING_DIR;

    if (!command) {
      return "Error: no se proporcionó ningún comando.";
    }

    // Verificar comandos peligrosos
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return `⚠️ COMANDO BLOQUEADO POR SEGURIDAD: "${command}"\n\nEste comando se ha clasificado como potencialmente destructivo. Si el Creador lo ha pedido explícitamente, reformula el comando de forma más segura o pide confirmación antes de ejecutarlo.`;
      }
    }

    console.log(`\n[Shell] Ejecutando: ${command} (cwd: ${cwd})`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env, LANG: 'es_ES.UTF-8' },
      });

      let output = "";
      
      if (stdout) {
        const trimmedOut = stdout.length > MAX_OUTPUT_LENGTH 
          ? stdout.substring(0, MAX_OUTPUT_LENGTH) + `\n\n... (salida truncada, ${stdout.length} chars totales)`
          : stdout;
        output += trimmedOut;
      }

      if (stderr) {
        const trimmedErr = stderr.length > MAX_OUTPUT_LENGTH 
          ? stderr.substring(0, MAX_OUTPUT_LENGTH) + `\n\n... (errores truncados)`
          : stderr;
        if (output) output += "\n\n";
        output += `STDERR:\n${trimmedErr}`;
      }

      if (!output.trim()) {
        output = "(comando ejecutado sin salida)";
      }

      console.log(`[Shell] ✅ Completado (${output.length} chars)`);
      return output;
    } catch (err: any) {
      console.error(`[Shell] ❌ Error:`, err.message?.substring(0, 200));

      if (err.killed) {
        return `⏱️ Timeout: el comando superó los ${TIMEOUT_MS / 1000} segundos y fue terminado.`;
      }

      let errorOutput = `Error ejecutando: ${command}\n\nCódigo de salida: ${err.code || 'desconocido'}\n`;
      
      if (err.stdout) {
        errorOutput += `\nSalida:\n${err.stdout.substring(0, MAX_OUTPUT_LENGTH)}`;
      }
      if (err.stderr) {
        errorOutput += `\nError:\n${err.stderr.substring(0, MAX_OUTPUT_LENGTH)}`;
      }
      
      return errorOutput;
    }
  }
};
