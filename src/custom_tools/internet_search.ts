export default {
  name: "internet_search",
  description: "Realiza una búsqueda en internet y devuelve resultados reales con títulos, links y descripciones. Usa Google como primera opción y DuckDuckGo HTML como respaldo gratuito.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Términos de búsqueda" }
    },
    required: ["query"]
  },
  handler: async (args: any) => {
    const query = args.query;
    console.log(`\n[Internet Search] Consultando: "${query}"...`);

    // Intento 1: Google Custom Search (si está configurado)
    const googleResult = await tryGoogleSearch(query);
    if (googleResult) return googleResult;

    // Intento 2: DuckDuckGo HTML Scraping (gratuito, sin API Key, resultados reales)
    const ddgResult = await tryDuckDuckGoHTML(query);
    if (ddgResult) return ddgResult;

    return `No se encontraron resultados para "${query}". Intenta reformular tu consulta.`;
  }
};

async function tryGoogleSearch(query: string): Promise<string | null> {
  const api_key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!api_key || !cx) return null;

  try {
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${api_key}&cx=${cx}&q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
      console.warn(`[Search] Google falló (${response.status}). Pasando a DuckDuckGo...`);
      return null;
    }
    const data = await response.json();
    const items = data.items || [];
    if (items.length === 0) return null;

    console.log(`[Search] ✅ Éxito con Google (${items.length} resultados).`);
    let summary = `Resultados de búsqueda para "${query}":\n\n`;
    items.slice(0, 5).forEach((item: any, i: number) => {
      summary += `${i + 1}. ${item.title}\n   ${item.link}\n   ${item.snippet}\n\n`;
    });
    return summary;
  } catch (e) {
    console.error("[Search] Error en Google:", e);
    return null;
  }
}

async function tryDuckDuckGoHTML(query: string): Promise<string | null> {
  try {
    console.log(`[Search] Buscando en DuckDuckGo HTML...`);

    // DuckDuckGo HTML lite: devuelve resultados REALES en HTML simple
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.warn(`[Search] DuckDuckGo HTML falló (${response.status}).`);
      return null;
    }

    const html = await response.text();

    // Extraer resultados del HTML con regex simple (no necesitamos una librería DOM)
    const results: { title: string; url: string; snippet: string }[] = [];

    // Patrón para extraer resultados de DuckDuckGo HTML lite
    const resultBlocks = html.split('class="result__body"');

    for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
      const block = resultBlocks[i];

      // Extraer título
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
      const title = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : null;

      // Extraer URL
      const urlMatch = block.match(/class="result__url"[^>]*>([^<]+)</);
      const href = urlMatch ? urlMatch[1].trim() : null;

      // Extraer snippet/descripción
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      snippet = decodeHTMLEntities(snippet);

      if (title && (href || snippet)) {
        results.push({
          title,
          url: href ? (href.startsWith('http') ? href : `https://${href}`) : '',
          snippet: snippet.substring(0, 200),
        });
      }
    }

    if (results.length === 0) {
      console.warn("[Search] DuckDuckGo no devolvió resultados parseables.");
      return null;
    }

    console.log(`[Search] ✅ Éxito con DuckDuckGo (${results.length} resultados).`);
    let summary = `Resultados de búsqueda para "${query}":\n\n`;
    results.forEach((r, i) => {
      summary += `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}\n\n`;
    });
    return summary;
  } catch (err: any) {
    console.error("[Search] Error DuckDuckGo HTML:", err.message);
    return null;
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}