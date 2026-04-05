import { getBriefingPreferences, saveBriefingPreferences } from '../lib/daily-briefing.js';

export default {
  name: "configure_briefing",
  description: `Lee o modifica las preferencias del briefing matutino diario. Usa esta herramienta cuando el Creador quiera personalizar su briefing: cambiar ubicación del tiempo, añadir o quitar categorías de noticias, excluir deportes, pedir más tecnología, cambiar el estilo de la frase del día, etc. 
  
Acciones disponibles:
- "get": devuelve la configuración actual
- "update": actualiza campos específicos

Campos modificables:
- location: ciudad para el tiempo (ej: "Madrid")
- newsCategories: array de categorías a incluir (ej: ["mundo","tecnología","ciencia"])
- excludeCategories: array de categorías a excluir (ej: ["deportes","farándula"])
- extraTopics: array de temas extra a buscar (ej: ["inteligencia artificial","criptomonedas"])
- quoteStyle: estilo de la frase del día (ej: "filosófica estoica", "de ciencia ficción", "motivacional")
- customInstructions: instrucciones extra libres (ej: "Dame las noticias en tono sarcástico")`,
  parameters: {
    type: "object",
    properties: {
      action: { 
        type: "string", 
        description: "Acción: 'get' para ver preferencias actuales, 'update' para modificarlas" 
      },
      updates: { 
        type: "object", 
        description: "Campos a actualizar (solo para action='update')",
        properties: {
          location: { type: "string" },
          newsCategories: { type: "array", items: { type: "string" } },
          excludeCategories: { type: "array", items: { type: "string" } },
          extraTopics: { type: "array", items: { type: "string" } },
          quoteStyle: { type: "string" },
          customInstructions: { type: "string" },
        }
      }
    },
    required: ["action"]
  },
  handler: async (args: any) => {
    const { action, updates } = args;

    if (action === "get") {
      const prefs = await getBriefingPreferences();
      return `Configuración actual del briefing:\n\n` +
        `📍 Ubicación: ${prefs.location}\n` +
        `📰 Categorías: ${prefs.newsCategories.join(", ")}\n` +
        `🚫 Excluidas: ${prefs.excludeCategories.join(", ") || "ninguna"}\n` +
        `🔍 Temas extra: ${prefs.extraTopics.join(", ") || "ninguno"}\n` +
        `💬 Estilo frase: ${prefs.quoteStyle}\n` +
        `📝 Instrucciones: ${prefs.customInstructions || "ninguna"}`;
    }

    if (action === "update" && updates) {
      const newPrefs = await saveBriefingPreferences(updates);
      return `✅ Briefing actualizado:\n\n` +
        `📍 Ubicación: ${newPrefs.location}\n` +
        `📰 Categorías: ${newPrefs.newsCategories.join(", ")}\n` +
        `🚫 Excluidas: ${newPrefs.excludeCategories.join(", ") || "ninguna"}\n` +
        `🔍 Temas extra: ${newPrefs.extraTopics.join(", ") || "ninguno"}\n` +
        `💬 Estilo frase: ${newPrefs.quoteStyle}\n` +
        `📝 Instrucciones: ${newPrefs.customInstructions || "ninguna"}`;
    }

    return "Acción no reconocida. Usa 'get' para ver o 'update' para modificar.";
  }
};
