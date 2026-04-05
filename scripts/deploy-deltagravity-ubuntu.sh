#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Uso:
  ./scripts/deploy-deltagravity-ubuntu.sh usuario@192.168.3.50 [ruta_remota]

Ejemplo:
  ./scripts/deploy-deltagravity-ubuntu.sh cayetano@192.168.3.50 /home/cayetano/Proyectos/DeltaGravity

Qué hace:
  1. Sincroniza este proyecto por SSH al Ubuntu remoto.
  2. Ajusta rutas del proyecto al HOME real del remoto.
  3. Fuerza DeltaGravity a usar Ollama con qwen2.5-coder:14b.
  4. Expone Ollama para que el contenedor pueda alcanzarlo.
  5. Despliega el contenedor correto y activa su systemd/watchdog remoto.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

REMOTE="${1:-}"
REMOTE_DIR_INPUT="${2:-~/Proyectos/DeltaGravity}"
MODEL="${OLLAMA_MODEL:-qwen2.5-coder:14b}"

if [[ -z "$REMOTE" ]]; then
  usage
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Falta el comando requerido: %s\n' "$1" >&2
    exit 1
  fi
}

require_cmd ssh
require_cmd rsync

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
)
SSH_TTY_OPTS=(
  -tt
  -o StrictHostKeyChecking=accept-new
)

printf '==> Resolviendo HOME remoto en %s\n' "$REMOTE"
REMOTE_HOME="$(ssh "${SSH_OPTS[@]}" "$REMOTE" 'printf %s "$HOME"')"
if [[ -z "$REMOTE_HOME" ]]; then
  printf 'No he podido resolver el HOME remoto.\n' >&2
  exit 1
fi

REMOTE_DIR="$REMOTE_DIR_INPUT"
if [[ "$REMOTE_DIR" == "~" ]]; then
  REMOTE_DIR="$REMOTE_HOME"
elif [[ "$REMOTE_DIR" == "~/"* ]]; then
  REMOTE_DIR="$REMOTE_HOME/${REMOTE_DIR#~/}"
fi

printf '==> Proyecto local: %s\n' "$LOCAL_DIR"
printf '==> Proyecto remoto: %s:%s\n' "$REMOTE" "$REMOTE_DIR"
printf '==> Modelo Ollama: %s\n' "$MODEL"

ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$REMOTE_DIR'"

printf '==> Sincronizando proyecto\n'
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.deltagravity/' \
  "$LOCAL_DIR/" "$REMOTE:$REMOTE_DIR/"

printf '==> Preparando despliegue remoto\n'
ssh "${SSH_TTY_OPTS[@]}" "$REMOTE" \
  "cd '$REMOTE_DIR' && chmod +x ./scripts/deploy-deltagravity-remote.sh && REMOTE_DIR='$REMOTE_DIR' REMOTE_HOME='$REMOTE_HOME' MODEL='$MODEL' ./scripts/deploy-deltagravity-remote.sh"

printf '==> Despliegue completado en %s\n' "$REMOTE"
