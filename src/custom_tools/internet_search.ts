export default {
  name: "internet_search",
  description: "Búsqueda absoluta en internet con simulación de navegación real. Devuelve títulos, links y fragmentos de noticias actualizadas.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Términos de búsqueda" }
    },
    required: ["query"]
  },
  handler: async (args: any) => {
    const query = args.query;
    console.log(`\n[Internet Search] Ejecutando búsqueda absoluta para: "${query}"...`);

    // Prioridad 1: Google Custom Search (si el Creador lo tiene)
    const googleResult = await tryGoogleSearch(query);
    if (googleResult) return googleResult;

    // Prioridad 2: DuckDuckGo con Simulación de Navegador Real (VQD + Cookies)
    const ddgResult = await tryDuckDuckGoAdvanced(query);
    if (ddgResult) return ddgResult;

    // Prioridad 3: SearXNG (Instancias estables)
    const searxResult = await trySearXNG(query);
    if (searxResult) return searxResult;

    return `Creador, he agotado todas las vías de búsqueda. No hay resultados para "${query}". Es posible que el término sea demasiado específico o haya un bloqueo regional masivo.`;
  }
};

async function tryGoogleSearch(query: string): Promise<string | null> {
  const api_key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!api_key || !cx) return null;
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${api_key}&cx=${cx}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const items = data.items || [];
    if (items.length === 0) return null;
    console.log(`[Search] ✅ Datos extraídos de Google API.`);
    let summary = `Fuentes consultadas (Google):\n\n`;
    items.slice(0, 5).forEach((item: any, i: number) => {
      summary += `[${i + 1}] ${item.title}\nURL: ${item.link}\nInfo: ${item.snippet}\n\n`;
    });
    return summary;
  } catch (e) { return null; }
}

async function tryDuckDuckGoAdvanced(query: string): Promise<string | null> {
    try {
        console.log(`[Search] Simulando navegador para DuckDuckGo...`);
        const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
        
        // 1. Obtener VQD e Inicializar Cookies
        const response1 = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
            headers: { "User-Agent": userAgent }
        });
        const xhtml = await response1.text();
        const vqdMatch = xhtml.match(/vqd=["']?([^"']+)["']?/) || xhtml.match(/vqd=([^&]+)/);
        if (!vqdMatch) return null;
        const vqd = vqdMatch[1];

        // 2. Ejecutar búsqueda con Headers de navegador real
        const searchUrl = `https://links.duckduckgo.com/d.js?q=${encodeURIComponent(query)}&vqd=${vqd}&s=0&l=es-es&p=1&v7exp=a&ss_m=1`;
        const response2 = await fetch(searchUrl, {
            headers: {
                "User-Agent": userAgent,
                "Referer": "https://duckduckgo.com/",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Cookie": "l=es-es; vqd=" + vqd
            }
        });

        if (!response2.ok) return null;
        const text = await response2.text();
        
        // Extracción robusta por Regex (por si el JSON está "sucio")
        const results: any[] = [];
        const regex = /\{"a":"([\s\S]*?)","t":"([\s\S]*?)","u":"([\s\S]*?)"\}/g;
        let match;
        while ((match = regex.exec(text)) !== null && results.length < 5) {
            results.push({ t: match[2], u: match[3], a: match[1] });
        }

        if (results.length === 0) return null;

        console.log(`[Search] ✅ Éxito con DuckDuckGo Advanced.`);
        let summary = `Fuentes consultadas (DuckDuckGo):\n\n`;
        results.forEach((r, i) => {
            summary += `[${i + 1}] ${decodeHTMLEntities(r.t)}\nURL: ${r.u}\nInfo: ${decodeHTMLEntities(r.a)}\n\n`;
        });
        return summary;
    } catch (e) { return null; }
}

async function trySearXNG(query: string): Promise<string | null> {
    try {
        console.log(`[Search] Intentando SearXNG (Backup)...`);
        const response = await fetch(`https://searx.be/search?q=${encodeURIComponent(query)}&format=json`, {
            headers: { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/121.0.0.0" }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const results = data.results || [];
        if (results.length === 0) return null;
        console.log(`[Search] ✅ Éxito con SearXNG.`);
        let summary = `Fuentes consultadas (SearXNG):\n\n`;
        results.slice(0, 5).forEach((r: any, i: number) => {
            summary += `[${i + 1}] ${r.title}\nURL: ${r.url}\nInfo: ${r.content || ""}\n\n`;
        });
        return summary;
    } catch (e) { return null; }
}

function decodeHTMLEntities(text: string): string {
    if (!text) return "";
    return text
        .replace(/\\x27/g, "'").replace(/\\x22/g, '"').replace(/\\x2d/g, '-')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}