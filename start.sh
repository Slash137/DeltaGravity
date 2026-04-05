#!/bin/bash

# Directorio del proyecto
PROJECT_DIR="/home/cayetano/Proyectos/DeltaGravity"
LOG_FILE="$PROJECT_DIR/term.log"
PID_FILE="$PROJECT_DIR/deltagravity.pid"

# Navegar al directorio
cd "$PROJECT_DIR" || exit

# 1. Matar instancias previas de forma segura
echo "🛑 Limpiando procesos previos..."

# Intentar primero por archivo PID
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null && sleep 1
    fi
fi

# Matar cualquier proceso que use tsx e index.ts (excluyendo este script)
# grep -v $$ evita que el script se mate a sí mismo
pgrep -f "tsx.*index\.ts" | grep -v $$ | xargs kill -9 2>/dev/null
sleep 1

# 2. Limpiar el log
echo "--- Reiniciando DeltaGravity Nativo: $(date) ---" > "$LOG_FILE"

# 3. Lanzar el proceso
# Ejecutamos con tsx directamente
nohup npx tsx src/index.ts >> "$LOG_FILE" 2>&1 &
NEW_PID=$!

# 4. Guardar y mostrar el nuevo PID
echo "$NEW_PID" > "$PID_FILE"

echo "🚀 DeltaGravity iniciado (PID: $NEW_PID)"
echo "Logs en: $LOG_FILE"
