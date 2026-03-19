import { Bot, InputFile } from 'grammy';

import { config } from './config.js';
import { runAgent } from './lib/agent.js';
import { repository } from './lib/database.js';
import { transcribeAudio, generateSpeech } from './lib/llm.js';


export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Whitelist Middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !config.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
    console.warn(`Unauthorized access attempt from user: ${userId}`);
    if (userId) await ctx.reply(`Acceso denegado. Tu ID de usuario es: ${userId}`);
    return;
  }
  return await next();
});

bot.command('start', (ctx) => ctx.reply('DeltaGravity operativo. ¿En qué puedo ayudarte?'));
bot.command('clear', async (ctx) => {
  await repository.clearHistory(ctx.from!.id);
  await ctx.reply('Memoria de conversación limpiada.');
});

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  await ctx.replyWithChatAction('typing');
  
  try {
    const response = await runAgent(userId, text);
    
    // Si la respuesta es corta o el usuario lo ha pedido, podemos usar voz.
    // Para simplificar, si ElevenLabs está configurado, enviaremos AMBOS o solo voz si se pide.
    // Por ahora, enviaremos texto y, si el usuario pide voz explícitamente, enviaremos audio.
    const lowerText = text.toLowerCase();
    const wantsVoice = lowerText.includes('voz') || lowerText.includes('audio') || lowerText.includes('habla') || lowerText.includes('di');

    if (config.ELEVENLABS_API_KEY && wantsVoice) {
      await ctx.replyWithChatAction('record_voice');
      try {
        const audioBuffer = await generateSpeech(response);
        await ctx.replyWithVoice(new InputFile(audioBuffer));
      } catch (ttsError) {
        console.error('Error in TTS for text msg:', ttsError);
        await ctx.reply(response);
      }
    } else {
      await ctx.reply(response);
    }

  } catch (error) {
    console.error('Error in bot:', error);
    await ctx.reply('Lo siento, ha ocurrido un error al procesar tu mensaje.');
  }
});

bot.on(['message:voice', 'message:audio'], async (ctx) => {
  const userId = ctx.from.id;
  await ctx.replyWithChatAction('typing');

  try {
    const file = await ctx.getFile();
    if (!file.file_path) {
      await ctx.reply('Lo siento, no he podido descargar el audio.');
      return;
    }

    const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const transcribedText = await transcribeAudio(buffer, 'audio.ogg');

    if (!transcribedText || transcribedText.trim() === '') {
      await ctx.reply('No he logrado entender el audio. ¿Podrías repetirlo?');
      return;
    }

    await ctx.reply(`_Escuchado: "${transcribedText}"_`, { parse_mode: 'Markdown' });

    const agentResponse = await runAgent(userId, `[Mensaje de voz]: ${transcribedText}`);
    
    if (config.ELEVENLABS_API_KEY) {
      await ctx.replyWithChatAction('record_voice');
      try {
        const audioBuffer = await generateSpeech(agentResponse);
        await ctx.replyWithVoice(new InputFile(audioBuffer));
      } catch (ttsError) {
        console.error('Error in TTS:', ttsError);
        await ctx.reply(agentResponse);
      }
    } else {
      await ctx.reply(agentResponse);
    }

  } catch (error) {
    console.error('Error handling voice:', error);
    await ctx.reply('Lo siento, ha ocurrido un error al procesar tu nota de voz.');
  }
});

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
