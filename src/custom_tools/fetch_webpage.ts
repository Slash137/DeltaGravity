export default {
  name: "fetch_webpage",
  description: "Descarga y extrae el contenido de texto de una página web. Úsala para leer artículos, noticias, documentación, datos concretos de una URL específica, o scrapping de información general. Devuelve el texto limpio extraído de la página.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL completa de la página a leer (ej: 'https://example.com/articulo')" },
      max_chars: { type: "number", description: "Máximo de caracteres a devolver (por defecto 4000)" }
    },
    required: ["url"]
  },
  handler: async (args: any) => {
    const url = args.url;
    const maxChars = args.max_chars || 4000;
    console.log(`\n[Fetch] Descargando: ${url}...`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        return `Error al acceder a ${url}: HTTP ${response.status}`;
      }

      const contentType = response.headers.get("content-type") || "";
      
      // Si es JSON, devolver directamente
      if (contentType.includes("application/json")) {
        const json = await response.json();
        const text = JSON.stringify(json, null, 2);
        console.log(`[Fetch] ✅ JSON recibido (${text.length} chars)`);
        return text.substring(0, maxChars);
      }

      const html = await response.text();
      const text = extractTextFromHTML(html);
      
      if (!text || text.length < 50) {
        return `La página ${url} no tiene contenido de texto extraíble (puede requerir JavaScript).`;
      }

      console.log(`[Fetch] ✅ Extraídos ${text.length} chars de ${url}`);
      return text.substring(0, maxChars);
    } catch (err: any) {
      console.error(`[Fetch] Error:`, err);
      if (err.name === "AbortError") {
        return `Timeout al acceder a ${url} (más de 15 segundos).`;
      }
      return `Error al descargar ${url}: ${err.message}`;
    }
  }
};

function extractTextFromHTML(html: string): string {
  // Eliminar scripts, styles, nav, footer, header
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Intentar extraer solo el contenido principal
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i) 
    || cleaned.match(/<article[\s\S]*?<\/article>/i)
    || cleaned.match(/class="[^"]*content[^"]*"[\s\S]*?<\/div>/i);
  
  if (mainMatch) {
    cleaned = mainMatch[0];
  }

  // Convertir elementos HTML a texto legible
  cleaned = cleaned
    // Saltos de línea para bloques
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|thead|tbody)[^>]*>/gi, "\n")
    // Bullets para list items
    .replace(/<li[^>]*>/gi, "\n• ")
    // Preservar links importantes
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2")
    // Eliminar todas las demás etiquetas
    .replace(/<[^>]+>/g, " ");

  // Decodificar entidades HTML
  cleaned = cleaned
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Limpiar espacios
  cleaned = cleaned
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length > 2)
    .join("\n");

  // Eliminar líneas duplicadas consecutivas
  cleaned = cleaned.replace(/(\n\s*){3,}/g, "\n\n");

  return cleaned.trim();
}
