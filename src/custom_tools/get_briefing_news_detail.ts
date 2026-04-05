import { repository } from '../lib/database.js';

export default {
  name: "get_briefing_news_detail",
  description: "Recupera la información detallada (título, fuente, snippet y URL) de una noticia específica del último briefing matutino guardado. Usa esto cuando el Creador pida 'más detalles sobre la noticia X' para obtener el contexto completo y poder expandir la información.",
  parameters: {
    type: "object",
    properties: {
      newsNumber: {
        type: "number",
        description: "El número de la noticia en el briefing (1, 2, 3...)"
      }
    },
    required: ["newsNumber"]
  },
  handler: async ({ newsNumber }: { newsNumber: number }) => {
    try {
      const stored = await repository.getMemory("last_briefing_news");
      if (!stored) {
        return "No hay datos del último briefing guardados.";
      }

      const newsItems = JSON.parse(stored);
      const item = newsItems.find((n: any) => n.id === newsNumber);

      if (!item) {
        return `No se encontró la noticia número ${newsNumber} en el último briefing. Solo hay ${newsItems.length} noticias disponibles.`;
      }

      return `DETALLE DE LA NOTICIA ${newsNumber}:\n` +
             `Título: ${item.title}\n` +
             `Fuente: ${item.source || 'Desconocida'}\n` +
             `URL: ${item.url || 'No disponible'}\n` +
             `Snippet Original: ${item.snippet || 'No disponible'}\n\n` +
             `Usa esta información para dar una respuesta detallada al Creador. Puedes usar herramientas de búsqueda si necesitas ampliar información actual sobre este tema.`;
    } catch (err: any) {
      return `Error recuperando el detalle: ${err.message}`;
    }
  }
};
