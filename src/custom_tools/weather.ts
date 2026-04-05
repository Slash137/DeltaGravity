export default {
  name: "weather",
  description: "Obtiene el tiempo meteorológico actual y la previsión para una ubicación. Devuelve temperatura, estado del cielo, viento, humedad y previsión de los próximos días. Úsala SIEMPRE que el usuario pregunte por el tiempo, temperatura, lluvia, clima, etc.",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "Ciudad o ubicación (ej: 'Crevillente', 'Madrid', 'London')" }
    },
    required: ["location"]
  },
  handler: async (args: any) => {
    const location = args.location;
    console.log(`\n[Weather] Consultando tiempo para: "${location}"...`);

    try {
      // wttr.in devuelve datos meteorológicos reales en texto plano
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=es`,
        {
          headers: { "User-Agent": "curl/7.68.0" },
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (!response.ok) {
        return `No se pudo obtener el tiempo para "${location}". Código: ${response.status}`;
      }

      const data = await response.json();
      const current = data.current_condition?.[0];
      const forecast = data.weather || [];
      const area = data.nearest_area?.[0];

      if (!current) {
        return `No hay datos meteorológicos disponibles para "${location}".`;
      }

      const areaName = area?.areaName?.[0]?.value || location;
      const region = area?.region?.[0]?.value || "";
      const country = area?.country?.[0]?.value || "";

      // Datos actuales
      let result = `🌍 Tiempo en ${areaName}${region ? `, ${region}` : ""}${country ? ` (${country})` : ""}\n\n`;
      result += `📍 AHORA MISMO:\n`;
      result += `🌡️ Temperatura: ${current.temp_C}°C (sensación térmica: ${current.FeelsLikeC}°C)\n`;
      result += `☁️ Estado: ${current.lang_es?.[0]?.value || current.weatherDesc?.[0]?.value || "Desconocido"}\n`;
      result += `💨 Viento: ${current.windspeedKmph} km/h (${current.winddir16Point})\n`;
      result += `💧 Humedad: ${current.humidity}%\n`;
      result += `🌧️ Precipitación: ${current.precipMM} mm\n`;
      result += `👁️ Visibilidad: ${current.visibility} km\n`;
      result += `☀️ Índice UV: ${current.uvIndex}\n`;

      // Previsión de los próximos días
      if (forecast.length > 0) {
        result += `\n📅 PREVISIÓN:\n`;
        for (const day of forecast.slice(0, 3)) {
          const date = day.date;
          const maxTemp = day.maxtempC;
          const minTemp = day.mintempC;
          const desc = day.hourly?.[4]?.lang_es?.[0]?.value || day.hourly?.[4]?.weatherDesc?.[0]?.value || "";
          const rainChance = day.hourly?.[4]?.chanceofrain || "0";
          const sunrise = day.astronomy?.[0]?.sunrise || "";
          const sunset = day.astronomy?.[0]?.sunset || "";
          
          result += `\n📆 ${date}: ${minTemp}°C - ${maxTemp}°C | ${desc}\n`;
          result += `   🌧️ Prob. lluvia: ${rainChance}%`;
          if (sunrise) result += ` | 🌅 ${sunrise} - 🌇 ${sunset}`;
          result += `\n`;
        }
      }

      console.log(`[Weather] ✅ Datos obtenidos para ${areaName}`);
      return result;
    } catch (err: any) {
      console.error(`[Weather] Error:`, err);
      return `Error al consultar el tiempo para "${location}": ${err.message}`;
    }
  }
};
