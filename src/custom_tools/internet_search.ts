const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default {
  name: "internet_search",
  description: "Búsqueda en internet. Devuelve títulos, links y fragmentos de resultados. IMPORTANTE: Si necesitas datos concretos de una página, usa después 'fetch_webpage' con la URL del resultado más relevante para leer su contenido completo. Para consultas sobre el tiempo/clima, usa la herramienta 'weather' en su lugar.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Términos de búsqueda" }
    },
    required: ["query"]
  },
  handler: async (args: any) => {
    const query = args.query;
    console.log(`\n[Internet Search] Buscando: "${query}"...`);

    // Intentar todas las fuentes en orden
    const strategies = [
      () => tryDuckDuckGoLite(query),
      () => tryDuckDuckGoHTML(query),
      () => trySearXNG(query, "https://searx.be"),
      () => trySearXNG(query, "https://search.bus-hit.me"),
      () => trySearXNG(query, "https://searx.tiekoetter.com"),
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) return result;
      } catch (e: any) {
        console.warn(`[Search] Falló una estrategia: ${e.message?.substring(0, 100)}`);
      }
    }

    return `No se encontraron resultados para "${query}". Los motores de búsqueda no respondieron.`;
  }
};

// --- DuckDuckGo Lite (más fiable que la API JSON) ---
async function tryDuckDuckGoLite(query: string): Promise<string | null> {
  console.log(`[Search] Intentando DuckDuckGo Lite...`);
  
  const response = await fetchWithTimeout(`https://lite.duckduckgo.com/lite/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  if (!response.ok) return null;
  const html = await response.text();

  // Extraer resultados del HTML de DDG Lite
  const results: { title: string; url: string; snippet: string }[] = [];
  
  // DDG Lite tiene links en <a class="result-link"> y snippets en <td class="result-snippet">
  const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td\s+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  
  const links: { url: string; title: string }[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({ url: match[1], title: cleanHTML(match[2]) });
  }
  
  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(cleanHTML(match[1]));
  }

  for (let i = 0; i < Math.min(links.length, 5); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
    });
  }

  if (results.length === 0) return null;

  console.log(`[Search] ✅ DuckDuckGo Lite: ${results.length} resultados`);
  return formatResults("DuckDuckGo", results);
}

// --- DuckDuckGo HTML (búsqueda normal) ---
async function tryDuckDuckGoHTML(query: string): Promise<string | null> {
  console.log(`[Search] Intentando DuckDuckGo HTML...`);
  
  const response = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html",
      },
    }
  );

  if (!response.ok) return null;
  const html = await response.text();

  const results: { title: string; url: string; snippet: string }[] = [];
  
  // Extraer resultados: cada resultado está en un div con class="result"
  const resultBlocks = html.split(/class="result\s/);
  
  for (let i = 1; i < Math.min(resultBlocks.length, 6); i++) {
    const block = resultBlocks[i];
    
    // Extraer URL
    const urlMatch = block.match(/href="([^"]*uddg=([^&"]*))/);
    const url = urlMatch ? decodeURIComponent(urlMatch[2]) : "";
    
    // Extraer título
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? cleanHTML(titleMatch[1]) : "";
    
    // Extraer snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:td|div|span)>/);
    const snippet = snippetMatch ? cleanHTML(snippetMatch[1]) : "";
    
    if (url && title) {
      results.push({ title, url, snippet });
    }
  }

  if (results.length === 0) return null;

  console.log(`[Search] ✅ DuckDuckGo HTML: ${results.length} resultados`);
  return formatResults("DuckDuckGo", results);
}

// --- SearXNG (múltiples instancias) ---
async function trySearXNG(query: string, baseUrl: string): Promise<string | null> {
  console.log(`[Search] Intentando SearXNG (${baseUrl})...`);
  
  const response = await fetchWithTimeout(
    `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&language=es`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    }
  );

  if (!response.ok) return null;
  const data = await response.json();
  const rawResults = data.results || [];
  
  if (rawResults.length === 0) return null;

  const results = rawResults.slice(0, 5).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
  }));

  console.log(`[Search] ✅ SearXNG (${baseUrl}): ${results.length} resultados`);
  return formatResults("SearXNG", results);
}

// --- Utilidades ---
function formatResults(source: string, results: { title: string; url: string; snippet: string }[]): string {
  let output = `Resultados de búsqueda (${source}):\n\n`;
  results.forEach((r, i) => {
    output += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n\n`;
  });
  return output;
}

function cleanHTML(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}