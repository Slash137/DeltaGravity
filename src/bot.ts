import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { runAgent } from './lib/agent.js';
import { repository } from './lib/database.js';
import { config } from './config.js';
import { getBriefingPreferences, saveBriefingPreferences, BriefingPreferences } from './lib/daily-briefing.js';

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

// --- COMANDO DE CONFIGURACIÓN ---
const showConfigDashboard = async (ctx: Context) => {
  const prefs = await getBriefingPreferences();
  const text = `<b>⚙️ CONFIGURACIÓN DE DELTA</b>\n\n` +
               `📍 <b>Ubicación:</b> <code>${prefs.location}</code>\n` +
               `📰 <b>Noticias:</b> <code>${prefs.newsCategories.join(", ")}</code>\n` +
               `🌐 <b>Idioma Noticias:</b> <code>${prefs.newsLanguage === 'es' ? 'Español 🇪🇸' : 'Inglés 🇺🇸'}</code>\n` +
               `🚫 <b>Excluir:</b> <code>${prefs.excludeCategories.join(", ") || "ninguna"}</code>\n` +
               `💬 <b>Estilo Frase:</b> <code>${prefs.quoteStyle}</code>\n\n` +
               `<i>Selecciona una categoría para modificarla:</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📍 Ubicación', 'config_location'), Markup.button.callback('🌐 Idioma', 'config_lang')],
    [Markup.button.callback('📰 Categorías', 'config_cats'), Markup.button.callback('🚫 Exclusiones', 'config_exclude')],
    [Markup.button.callback('💬 Estilo Frase', 'config_quote'), Markup.button.callback('🔄 Refresh', 'config_main')]
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
};

bot.command('config', async (ctx) => {
  const text = ctx.message?.text || "";
  const args = text.split(" ").slice(1);

  if (args.length === 0) {
    return showConfigDashboard(ctx);
  }

  // Subcomandos de texto: /config ciudad Madrid
  const sub = args[0].toLowerCase();
  const value = args.slice(1).join(" ");

  if (!value) return sendSimpleReply(ctx, `❌ <b>Falta el valor.</b> Uso: <code>/config [parámetro] [valor]</code>`);

  const updates: Partial<BriefingPreferences> = {};
  if (sub === 'ciudad' || sub === 'ubicacion' || sub === 'location') updates.location = value;
  else if (sub === 'noticias' || sub === 'cats') updates.newsCategories = value.split(",").map(s => s.trim());
  else if (sub === 'idioma' || sub === 'lang') updates.newsLanguage = value.includes('en') ? 'en' : 'es';
  else if (sub === 'excluir' || sub === 'exclude') updates.excludeCategories = value.split(",").map(s => s.trim());
  else if (sub === 'frase' || sub === 'quote') updates.quoteStyle = value;
  else if (sub === 'instrucciones') updates.customInstructions = value;

  if (Object.keys(updates).length > 0) {
    await saveBriefingPreferences(updates);
    await sendSimpleReply(ctx, `✅ <b>Configuración actualizada.</b> Usa <code>/config</code> para ver los cambios.`);
  } else {
    await sendSimpleReply(ctx, `❌ <b>Parámetro desconocido.</b> Prueba con: ciudad, noticias, idioma, excluir, frase.`);
  }
});

// Handlers para botones interactivos
bot.action('config_main', showConfigDashboard);

bot.action('config_location', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(`📍 <b>Cambiar Ubicación</b>\nEscribe: <code>/config ciudad [Nombre de Ciudad]</code>\nEjemplo: <code>/config ciudad Madrid</code>`, { parse_mode: 'HTML' });
});

bot.action('config_lang', async (ctx) => {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Español 🇪🇸', 'setlang_es'), Markup.button.callback('Inglés 🇺🇸', 'setlang_en')],
    [Markup.button.callback('⬅️ Volver', 'config_main')]
  ]);
  await ctx.editMessageText(`<b>🌐 Selecciona el idioma de las noticias:</b>`, { parse_mode: 'HTML', ...keyboard });
});

bot.action(/setlang_(es|en)/, async (ctx) => {
  const lang = ctx.match[1];
  await saveBriefingPreferences({ newsLanguage: lang });
  await ctx.answerCbQuery(`Idioma cambiado a ${lang.toUpperCase()}`);
  return showConfigDashboard(ctx);
});

bot.action('config_cats', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(`📰 <b>Categorías de Noticias</b>\nEscribe las categorías separadas por comas:\n<code>/config noticias mundo, tecnologia, ciencia</code>`, { parse_mode: 'HTML' });
});

bot.action('config_exclude', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(`🚫 <b>Exclusiones</b>\nEscribe qué temas NO quieres ver:\n<code>/config excluir deportes, farnadula</code>`, { parse_mode: 'HTML' });
});

bot.action('config_quote', async (ctx) => {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Filosófica', 'setquote_filosófica'), Markup.button.callback('Motivacional', 'setquote_motivacional')],
    [Markup.button.callback('Ciencia Ficción', 'setquote_ciencia ficción'), Markup.button.callback('Estoica', 'setquote_estoica')],
    [Markup.button.callback('⬅️ Volver', 'config_main')]
  ]);
  await ctx.editMessageText(`<b>💬 Selecciona el estilo de la frase:</b>`, { parse_mode: 'HTML', ...keyboard });
});

bot.action(/setquote_(.+)/, async (ctx) => {
  const style = ctx.match[1];
  await saveBriefingPreferences({ quoteStyle: style });
  await ctx.answerCbQuery(`Estilo cambiado a ${style}`);
  return showConfigDashboard(ctx);
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
