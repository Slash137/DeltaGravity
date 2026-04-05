# DeltaGravity

DeltaGravity es un agente de IA personal, seguro y privado que utiliza Telegram como su interfaz principal. Ejecuta modelos locales a través de **Ollama** y tiene acceso directo a la terminal del sistema para realizar tareas complejas.

## 🌟 Características Principales

- **Briefing Matutino Inteligente**: Genera resúmenes diarios a las 9:00 AM con el tiempo, noticias de actualidad y frases célebres.
- **Detalle de Noticias**: Permite profundizar en cualquier noticia del briefing simplemente pidiendo "más detalles sobre la noticia X".
- **Formato HTML Premium**: Todos los mensajes de Delta están formateados elegantemente con el sistema de etiquetas HTML de Telegram.
- **Acceso a Shell Nativo**: Capacidad para ejecutar comandos, buscar archivos y gestionar el sistema a través de `execute_command`.
- **Memoria Persistente**: Utiliza Firebase Firestore para recordar conversaciones y preferencias entre sesiones.
- **Identidad Única**: Delta tiene una personalidad firme, técnica y resolutiva, diseñada para ser tu copiloto tecnológico.

## 🛠 Instalación y Configuración

### Requisitos
- Node.js 20+
- Ollama (configurado con modelos como `qwen2.5-coder`, `mistral-small`, etc.)
- Firebase Project (para la base de datos Firestore)
- Telegram Bot Token

### Configuración del Entorno
Crea un archivo `.env` basado en `.env.example`:

```bash
TELEGRAM_BOT_TOKEN="tu_token_de_bot"
TELEGRAM_ALLOWED_USER_IDS="tu_id_de_usuario"
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="mistral-small:24b"
```

### Ejecución Nativa (Recomendado)
Para una mayor integración con el sistema y capacidad de ejecución de comandos, se recomienda el despliegue nativo:

```bash
# Instalación de dependencias
npm install

# Iniciar en modo desarrollo
npm run dev
```

## 🚀 Despliegue como Servicio de Sistema

Para que Delta esté siempre activo en tu servidor Ubuntu:

1. **Configurar el servicio**:
   ```bash
   sudo cp deltagravity.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now deltagravity.service
   ```

2. **Logs en tiempo real**:
   ```bash
   tail -f term.log
   ```

## 🤖 Comandos Útiles en Telegram

- `/briefing`: Genera un briefing matutino al instante.
- `/model [nombre]`: Cambia el modelo de Ollama que Delta está usando.
- `/status`: Muestra el estado del agente y el modelo actual.
- `/clear`: Borra la memoria a corto plazo de la conversación.
- `detállame la noticia X`: (Después de un briefing) Recupera la información completa de una noticia específica.

## 🔧 Herramientas del Agente

- `execute_command`: Ejecuta comandos de shell en el host.
- `get_briefing_news_detail`: Recupera contexto extendido de noticias del briefing.
- `internet_search`: Realiza búsquedas en la web para obtener información actualizada.
- `get_current_time`: Devuelve la hora local del servidor.
- `weather`: Consulta el pronóstico meteorológico detallado.

## 🛡 Seguridad

DeltaGravity incluye una lista blanca de IDs de Telegram. Solo los usuarios autorizados en `TELEGRAM_ALLOWED_USER_IDS` pueden interactuar con el agente, garantizando que tu Shell y tus datos estén protegidos.
