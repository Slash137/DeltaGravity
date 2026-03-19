export default {
  name: "internet_search",
  description: "Realiza una búsqueda en internet usando la API de Google Custom Search. Retorna un resumen en texto plano.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Términos de búsqueda" }
    },
    required: ["query"]
  },
  handler: async (args: any) => {
    const query = args.query;
    console.log(`\n[Internet Search] Evaluando consulta en vivo: "${query}"...`);
    const api_key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
    if (!api_key || !cx) {
      return "Error: Falta configurar GOOGLE_CUSTOM_SEARCH_API_KEY o GOOGLE_CUSTOM_SEARCH_CX en el archivo .env";
    }
    const url = "https://www.googleapis.com/customsearch/v1";
    const searchUrl = `${url}?key=${api_key}&cx=${cx}&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(searchUrl);
      if (!response.ok) {
        return `Error de red: ${response.status} ${response.statusText}`;
      }
      const data = await response.json();
      const items = data.items || [];
      if (items.length === 0) {
        console.log(`[Internet Search] Cero resultados encontrados.`);
        return "No se encontraron resultados.";
      }
      
      console.log(`[Internet Search] Éxito. Entregando ${Math.min(items.length, 5)} resultados al agente.`);
      let summary = `Resultados para "${query}":\n\n`;
      items.slice(0, 5).forEach((item: any, i: number) => {
        summary += `${i+1}. ${item.title}\n   ${item.link}\n   ${item.snippet}\n\n`;
      });
      return summary;
    } catch (error: any) {
      return `Error al ejecutar la búsqueda: ${error.message}`;
    }
  }
};