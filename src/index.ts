import { bot } from './bot.js';
import { startDailyBriefing } from './lib/daily-briefing.js';

console.log('🤖 DeltaGravity iniciando...');

// Protección: @everworker/oneringai registra un listener en 'SIGTERM' que llama process.exit(0).
// Lo neutralizamos para que no mate al bot.
const originalExit = process.exit;
process.exit = function(code?: number) {
  console.warn(`⚠️ Intento de process.exit(${code}) bloqueado.`);
  return undefined as never;
};

process.on('SIGINT', () => { console.log('🛑 Recibido SIGINT! Deteniendo bot...'); bot.stop('SIGINT'); originalExit(0); });
process.on('SIGTERM', () => { console.log('🛑 Recibido SIGTERM! Deteniendo bot...'); bot.stop('SIGTERM'); originalExit(0); });

console.log('Lanzando bot...');
bot.launch().catch((err) => {
  console.error('❌ Error crítico al lanzar el bot:', err);
});

// Activar briefing matutino diario
startDailyBriefing(bot);

console.log('🚀 DeltaGravity activo. Escuchando mensajes de Telegram...');

// Mantener el event loop vivo.
setInterval(() => {}, 60_000);

