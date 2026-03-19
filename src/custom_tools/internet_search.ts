export default {
  name: "internet_search",
  description: "Realiza una búsqueda en internet. Usa Google Custom Search de forma principal y DuckDuckGo como respaldo gratuito (sin API Key).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Términos de búsqueda" }
    },
    required: ["query"]
  },
  handler: async (args: any) => {
    const query = args.query;
    const api_key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;

    console.log(`\n[Internet Search] Consultando: "${query}"...`);

    // Intento 1: Google Custom Search (Si está configurado)
    if (api_key && cx) {
      try {
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${api_key}&cx=${cx}&q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl);
        
        if (response.ok) {
          const data = await response.json();
          const items = data.items || [];
          if (items.length > 0) {
            console.log(`[Search] Éxito con Google.`);
            let summary = `Resultados de Google para "${query}":\n\n`;
            items.slice(0, 5).forEach((item: any, i: number) => {
              summary += `${i+1}. ${item.title}\n   ${item.link}\n   ${item.snippet}\n\n`;
            });
            return summary;
          }
        } else {
          console.warn(`[Search] Google falló (${response.status}). Pasando a DuckDuckGo...`);
        }
      } catch (e) {
        console.error("[Search] Error en Google:", e);
      }
    }

    // Intento 2: DuckDuckGo (Gratis, sin API Key e ilimitado)
    try {
      console.log(`[Search] Buscando por DuckDuckGo...`);
      // DuckDuckGo API (Respuesta instantánea)
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const ddgRes = await fetch(ddgUrl);
      const ddgData = await ddgRes.json();

      if (ddgData.AbstractText) {
        return `Información de DuckDuckGo:\n\n${ddgData.AbstractText}\n\nFuente: ${ddgData.AbstractSource}\nLink: ${ddgData.AbstractURL}`;
      }
      
      // Fallback 3: Si DuckDuckGo no tiene Abstract, devolvemos enlaces relacionados básicos
      if (ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
        let summary = `Temas relacionados de DuckDuckGo para "${query}":\n\n`;
        ddgData.RelatedTopics.slice(0, 3).forEach((topic: any, i: number) => {
          if (topic.Text) summary += `${i+1}. ${topic.Text}\n   ${topic.FirstURL}\n\n`;
        });
        return summary;
      }

      return "No se pudieron obtener resultados ni de Google ni de DuckDuckGo. Verifica tu conexión o intenta con otra consulta.";
    } catch (err: any) {
      console.error("[Search] Fallo en DuckDuckGo:", err.message);
      return `Error crítico al ejecutar la búsqueda: ${err.message}`;
    }
  }
};