import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { repository } from './database.js';
import { OpenAI } from 'openai';

// Cliente Ollama directo para el briefing
const ollamaClient = new OpenAI({
  baseURL: `${config.OLLAMA_BASE_URL.replace(/\/+$/, '')}/v1`,
  apiKey: config.OLLAMA_API_KEY || 'ollama',
  timeout: 240_000,
});

// --- Preferencias del briefing ---

export interface NewsItem {
  title: string;
  url?: string;
  snippet?: string;
  source?: string;
}

export interface BriefingPreferences {
  location: string;
  newsCategories: string[];     // categorías a incluir
  excludeCategories: string[];  // categorías a excluir
  newsLanguage: string;         // idioma/región de las noticias
  extraTopics: string[];        // temas extra a buscar
  quoteStyle: string;           // estilo de la frase
  customInstructions: string;   // instrucciones extra del usuario
}

const DEFAULT_PREFERENCES: BriefingPreferences = {
  location: "Crevillente",
  newsCategories: ["mundo", "internacional", "tecnología", "economía", "ciencia", "política"],
  excludeCategories: ["deportes"],
  newsLanguage: "es",
  extraTopics: [],
  quoteStyle: "filosófica o motivacional",
  customInstructions: "",
};

const PREFS_KEY = "briefing_preferences";

export const getBriefingPreferences = async (): Promise<BriefingPreferences> => {
  try {
    const stored = await repository.getMemory(PREFS_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {}
  return { ...DEFAULT_PREFERENCES };
};

export const saveBriefingPreferences = async (prefs: Partial<BriefingPreferences>) => {
  const current = await getBriefingPreferences();
  const merged = { ...current, ...prefs };
  await repository.setMemory(PREFS_KEY, JSON.stringify(merged));
  return merged;
};

// --- Recopilar datos ---

const fetchWeather = async (location: string): Promise<string> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=es`,
      { headers: { "User-Agent": "curl/7.68.0" }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!response.ok) return "No se pudo obtener el tiempo.";

    const data = await response.json();
    const current = data.current_condition?.[0];
    const forecast = data.weather?.[0];
    const area = data.nearest_area?.[0]?.areaName?.[0]?.value || location;

    if (!current) return "Sin datos meteorológicos.";

    let result = `Tiempo en ${area}:\n`;
    result += `Ahora: ${current.temp_C}°C, ${current.lang_es?.[0]?.value || current.weatherDesc?.[0]?.value}\n`;
    result += `Viento: ${current.windspeedKmph} km/h | Humedad: ${current.humidity}%\n`;
    
    if (forecast) {
      result += `Hoy: ${forecast.mintempC}°C - ${forecast.maxtempC}°C\n`;
      const rainChance = forecast.hourly?.[4]?.chanceofrain || "0";
      result += `Probabilidad de lluvia: ${rainChance}%\n`;
      const sunrise = forecast.astronomy?.[0]?.sunrise || "";
      const sunset = forecast.astronomy?.[0]?.sunset || "";
      if (sunrise) result += `Amanecer: ${sunrise} | Atardecer: ${sunset}`;
    }

    return result;
  } catch (err: any) {
    return `Error obteniendo el tiempo: ${err.message}`;
  }
};

const fetchNews = async (prefs: BriefingPreferences): Promise<NewsItem[]> => {
  const language = prefs.newsLanguage || "es";
  const allNews: NewsItem[] = [];

  console.log(`[Briefing] Buscando noticias para categorías: ${prefs.newsCategories.join(", ")}`);

  // Estrategia 1: Google News RSS (Muy fiable)
  try {
    const rssResult = await fetchGoogleNewsRSS(language);
    if (rssResult && rssResult.length > 0) {
      allNews.push(...rssResult);
    }
  } catch (e: any) {
    console.warn(`[Briefing] Google News RSS falló: ${e.message}`);
  }

  // Estrategia 2: Búsqueda por categorías individuales en SearXNG/DDG
  if (allNews.length < 5) {
    const categoriesToSearch = prefs.newsCategories.slice(0, 3);
    for (const cat of categoriesToSearch) {
      try {
        const query = `${cat} noticias hoy ${prefs.excludeCategories.length > 0 ? "-" + prefs.excludeCategories.join(" -") : ""}`;
        const result = await fetchNewsSearXNG(query, prefs) || await fetchNewsDDG(query);
        if (result && result.length > 0) {
          allNews.push(...result);
          if (allNews.length >= 15) break;
        }
      } catch (e: any) {
        console.warn(`[Briefing] Búsqueda por categoría ${cat} falló.`);
      }
    }
  }

  return allNews.slice(0, 15); // Máximo 15 fuentes para no saturar el LLM
};

const fetchGoogleNewsRSS = async (lang: string): Promise<NewsItem[] | null> => {
  try {
    const hl = lang === "es" ? "es-ES" : "en-US";
    const gl = lang === "es" ? "ES" : "US";
    const ceid = lang === "es" ? "ES:es" : "US:en";
    const url = `https://news.google.com/rss?hl=${hl}&gl=${gl}&ceid=${ceid}`;

    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;

    const xml = await response.text();
    const items = xml.split("<item>");
    const results: NewsItem[] = [];

    for (let i = 1; i < Math.min(items.length, 12); i++) {
        const titleMatch = items[i].match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = items[i].match(/<link>([\s\S]*?)<\/link>/);
        
        if (titleMatch) {
            results.push({
                title: cleanHTML(titleMatch[1]),
                url: linkMatch ? linkMatch[1] : undefined,
                source: "Google News"
            });
        }
    }

    return results;
  } catch { return null; }
};

const fetchNewsSearXNG = async (query: string, prefs: BriefingPreferences): Promise<NewsItem[] | null> => {
  const instances = [
    "https://searx.be",
    "https://search.bus-hit.me",
    "https://searx.tiekoetter.com",
    "https://priv.au",
  ];

  for (const base of instances) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(
        `${base}/search?q=${encodeURIComponent(query)}&format=json&language=${prefs.newsLanguage}&categories=news&time_range=day`,
        {
          headers: { "User-Agent": "Mozilla/5.0 Chrome/124.0.0.0" },
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (!response.ok) continue;

      const data = await response.json();
      const results = data.results || [];
      if (results.length === 0) continue;

      return results.slice(0, 10).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        source: r.source || "SearXNG"
      }));
    } catch { continue; }
  }

  return null;
};

const fetchNewsDDG = async (query: string): Promise<NewsItem[] | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/124.0.0.0" },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!response.ok) return null;

    const html = await response.text();
    const results: NewsItem[] = [];
    const blocks = html.split(/class="result\s/);

    for (let i = 1; i < Math.min(blocks.length, 11); i++) {
      const titleMatch = blocks[i].match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = blocks[i].match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/);
      const urlMatch = blocks[i].match(/href="([^"]+)"/);
      
      if (titleMatch) {
        results.push({
          title: cleanHTML(titleMatch[1]),
          url: urlMatch ? urlMatch[1] : undefined,
          snippet: snippetMatch ? cleanHTML(snippetMatch[1]) : "",
          source: "DuckDuckGo"
        });
      }
    }

    return results;
  } catch { return null; }
};

// --- Generar el briefing con el LLM ---

const generateBriefing = async (
  weather: string,
  news: NewsItem[],
  prefs: BriefingPreferences,
  model: string,
): Promise<string> => {
  const today = new Date();
  const day = today.getDate();
  const month = today.toLocaleString('es-ES', { month: 'long' });
  const year = today.getFullYear();
  const weekday = today.toLocaleString('es-ES', { weekday: 'long' });
  const dateInfo = `${weekday}, ${day} de ${month} de ${year}`;

  const newsContext = news.map((n, i) => `${i + 1}. ${n.title}\n   Detalle: ${n.snippet || ""}\n   Fuente: ${n.source}`).join("\n\n");

  const customPart = prefs.customInstructions 
    ? `\nINSTRUCCIONES PERSONALIZADAS DEL CREADOR:\n${prefs.customInstructions}\n` 
    : "";

  const prompt = `Genera el briefing matutino de Delta para el Creador.

FECHA: ${dateInfo}

TIEMPO METEOROLÓGICO:
${weather}

NOTICIAS RECOPILADAS:
${newsContext}
${customPart}
FORMATO DE SALIDA — USA HTML DE TELEGRAM:
- <b>texto</b> para negrita
- <i>texto</i> para cursiva
- <code>texto</code> para monoespaciado
- No uses Markdown (ni **, ni #, ni _). 
- Solo HTML inline, sin <p> ni <div>.
- Separa secciones con líneas vacías.

ESTRUCTURA:
1. Saludo cálido y personal al Creador mencionando el día de la semana y la fecha.
2. 🌡️ <b>Tiempo</b>: Resumen conciso del pronóstico en ${prefs.location}.
3. 📰 <b>Noticias</b>: Las 5-10 noticias más relevantes. Prioriza: ${prefs.newsCategories.join(", ")}. ${prefs.excludeCategories.length > 0 ? "Evita: " + prefs.excludeCategories.join(", ") + "." : ""} Resume cada noticia en 1-2 líneas con contexto útil. No pongas links.
4. 💬 <b>Frase del día</b>: Una frase célebre real (${prefs.quoteStyle}) con su autor. Variada cada día, nunca repitas.

TONO: Delta — firme, cercano, informativo. Español. Emojis moderados.`;

  try {
    const response = await ollamaClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Eres Delta, el agente de DeltaGravity. Genera briefings matutinos en formato HTML de Telegram.' },
        { role: 'user', content: prompt },
      ],
    });

    let content = response.choices[0]?.message?.content?.trim() || "No pude generar el briefing de hoy.";
    // Limpiar posibles bloques markdown que el modelo pueda meter
    content = content.replace(/```html\n?/gi, "").replace(/```\n?/g, "");
    return content;
  } catch (err: any) {
    console.error('[Briefing] Error generando briefing con LLM:', err);
    return `☀️ Buenos días, Creador.\n\n<b>📆 ${dateInfo}</b>\n\n🌡️ ${weather}\n\n📰 <b>Noticias:</b>\n${news}`;
  }
};

// --- Scheduler ---

const BRIEFING_HOUR = 9;
const BRIEFING_MINUTE = 0;
const CHECK_INTERVAL_MS = 30_000;

let lastBriefingDate: string | null = null;

export const startDailyBriefing = (bot: Telegraf) => {
  const chatIds = config.TELEGRAM_ALLOWED_USER_IDS;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  if (!chatIds || chatIds.length === 0) {
    console.log(`[Briefing] [Timezone: ${timezone}] ⚠️ No hay TELEGRAM_ALLOWED_USER_IDS configurados. Briefing desactivado.`);
    return;
  }

  console.log(`[Briefing] [Timezone: ${timezone}] 📅 Briefing matutino programado a las ${BRIEFING_HOUR}:${String(BRIEFING_MINUTE).padStart(2, '0')} para ${chatIds.length} usuario(s).`);

  setInterval(async () => {
    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    
    if (now.getHours() === BRIEFING_HOUR && now.getMinutes() === BRIEFING_MINUTE && lastBriefingDate !== todayKey) {
      lastBriefingDate = todayKey;
      console.log(`[Briefing] 🌅 Generando briefing matutino...`);

      try {
        const briefing = await triggerBriefing();

        for (const chatId of chatIds) {
          try {
            await sendHTMLMessage(bot, chatId, briefing);
            console.log(`[Briefing] ✅ Briefing enviado a ${chatId}`);
          } catch (err: any) {
            console.error(`[Briefing] ❌ Error enviando a ${chatId}:`, err.message);
          }
        }
      } catch (err: any) {
        console.error('[Briefing] ❌ Error global:', err);
      }
    }
  }, CHECK_INTERVAL_MS);
};

// --- Trigger manual ---
export const triggerBriefing = async (): Promise<string> => {
  console.log(`[Briefing] 🔄 Generando briefing...`);
  const prefs = await getBriefingPreferences();
  const [weather, news] = await Promise.all([
    fetchWeather(prefs.location),
    fetchNews(prefs),
  ]);

  // Guardar noticias para poder detallarlas después
  // Filtramos solo las que tienen contenido útil
  const briefingNews = news.map((n, i) => ({
    id: i + 1,
    ...n
  }));
  await repository.setMemory("last_briefing_news", JSON.stringify(briefingNews));

  const model = config.OLLAMA_MODEL;
  return generateBriefing(weather, news, prefs, model);
};

// --- Enviar mensaje HTML ---
export const sendHTMLMessage = async (bot: Telegraf, chatId: number, text: string) => {
  const MAX_LEN = 4096;
  const chunks: string[] = [];
  
  if (text.length <= MAX_LEN) {
    chunks.push(text);
  } else {
    for (let i = 0; i < text.length; i += MAX_LEN) {
      chunks.push(text.substring(i, i + MAX_LEN));
    }
  }

  for (const chunk of chunks) {
    try {
      await bot.telegram.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
    } catch {
      // Si falla el HTML, enviar sin formato
      await bot.telegram.sendMessage(chatId, chunk);
    }
  }
};

// --- Utilidades ---
function cleanHTML(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
