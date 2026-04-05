#!/bin/bash

# Directorio del proyecto
PROJECT_DIR="/home/cayetano/Proyectos/DeltaGravity"
PID_FILE="$PROJECT_DIR/deltagravity.pid"

# Verificar si el archivo PID existe
if [ ! -f "$PID_FILE" ]; then
    echo "❌ Error: El archivo deltagravity.pid no existe. No se puede parar."
    exit 1
fi

# Leer el PID
PID=$(cat "$PID_FILE")

# Intentar matar el proceso
if ps -p "$PID" > /dev/null; then
    echo "🛑 Deteniendo DeltaGravity (PID $PID)..."
    kill "$PID"
    sleep 1
    # Forzar el cierre si sigue vivo
    if ps -p "$PID" > /dev/null; then
        echo "⚠️  El proceso no se cerró rápidamente, forzando con SIGKILL..."
        kill -9 "$PID"
    fi
    echo "✅ DeltaGravity detenido."
else
    echo "ℹ️  Ojo: El proceso con PID $PID ya no estaba en ejecución."
fi

# Limpiar el archivo PID
rm "$PID_FILE"
