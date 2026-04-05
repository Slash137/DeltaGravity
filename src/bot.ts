import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { runAgent } from './lib/agent.js';
import { repository } from './lib/database.js';
import { config } from './config.js';

// Timeout de 5 minutos para modelos locales lentos (default de Telegraf es 90s)
export const bot = new Telegraf<Context>(config.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 300_000,
});

bot.start((ctx) => sendSimpleReply(ctx, '<b>DeltaGravity Online.</b> Usa <code>/model [nombre]</code> para cambiar el cerebro.'));

// Comando para cambiar el modelo
bot.command('model', async (ctx) => {
  if (!ctx.message || !('text' in ctx.message)) return;
  
  const text = ctx.message.text;
  const newModel = text.split(' ').slice(1).join(' ').trim();

  const contextKey = ctx.chat.id.toString();
  const settings = await repository.getContextAgentSettings(contextKey);

  if (!newModel) {
    const currentModel = settings.codexModel || config.OLLAMA_MODEL;
    return sendSimpleReply(ctx, `🧠 Modelo actual: <code>${currentModel}</code>\n\nUso: <code>/model mistral-small:24b</code>`);
  }

  await repository.updateContextAgentSettings(contextKey, { ...settings, codexModel: newModel });
  await sendSimpleReply(ctx, `🚀 Cerebro actualizado a: <code>${newModel}</code>`);
});

bot.command('status', async (ctx) => {
  const contextKey = ctx.chat.id.toString();
  const settings = await repository.getContextAgentSettings(contextKey);
  const currentModel = settings.codexModel || config.OLLAMA_MODEL;
  await sendSimpleReply(ctx, `<b>ESTADO:</b> ✅ Operacional\n<b>CEREBRO:</b> 🤖 <code>${currentModel}</code>`);
});

bot.command('clear', async (ctx) => {
  try {
    const contextKey = ctx.chat.id.toString();
    await repository.clearContextHistory(contextKey);
    await sendSimpleReply(ctx, '<b>MEMORIA LIMPIA.</b> 🧹 ¡Hola de nuevo, Creador!');
  } catch (err) {
    console.error(err);
    await sendSimpleReply(ctx, '❌ <b>Error</b> al borrar la memoria.');
  }
});

bot.command('briefing', async (ctx) => {
  const typingInterval = setInterval(() => {
    ctx.sendChatAction('typing').catch(() => {});
  }, 4000);

  try {
    await sendSimpleReply(ctx, '📰 <b>Preparando tu briefing...</b> dame un momento.');
    await ctx.sendChatAction('typing');
    
    const { triggerBriefing } = await import('./lib/daily-briefing.js');
    const briefing = await triggerBriefing();
    
    await sendSimpleReply(ctx, briefing);
  } catch (err) {
    console.error(err);
    await sendSimpleReply(ctx, '❌ <b>Error</b> generando el briefing.');
  } finally {
    clearInterval(typingInterval);
  }
});

// Helper robusto para enviar mensajes con HTML y manejo de chunks
const sendSimpleReply = async (ctx: Context, text: string) => {
  const MAX_LENGTH = 4096;
  
  // Limpieza defensiva de caracteres que pueden romper el HTML si no vienen bien escapados
  // Pero permitimos las etiquetas básicas que usa Delta
  let safeText = text;
  
  if (safeText.length <= MAX_LENGTH) {
    try {
      await ctx.reply(safeText, { parse_mode: 'HTML' });
    } catch {
      await ctx.reply(safeText); // Fallback si falla el parseo HTML
    }
    return;
  }

  for (let i = 0; i < safeText.length; i += MAX_LENGTH) {
    const chunk = safeText.substring(i, i + MAX_LENGTH);
    try {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    } catch {
      await ctx.reply(chunk);
    }
  }
};

// Listener principal de texto
bot.on(message('text'), async (ctx) => {
  // Indicador de "escribiendo..." que se refresca cada 4 segundos
  const typingInterval = setInterval(() => {
    ctx.sendChatAction('typing').catch(() => {});
  }, 4000);

  try {
    await ctx.sendChatAction('typing');
    const contextKey = ctx.chat.id.toString();
    const result = await runAgent(contextKey, ctx.message.text);
    await sendSimpleReply(ctx, result);
  } catch (error) {
    console.error(error);
    await sendSimpleReply(ctx, `❌ <b>Ha ocurrido un error</b> al procesar tu mensaje.`);
  } finally {
    clearInterval(typingInterval);
  }
});
