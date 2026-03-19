import { bot } from './bot.js';

console.log('--- DeltaGravity ---');
console.log('Iniciando agente local...');

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot conectado como: @${botInfo.username}`);
    console.log('Escuchando mensajes...');
  },
});
