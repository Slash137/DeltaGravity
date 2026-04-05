#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="/home/cayetano/Proyectos/DeltaGravity"
SERVICE_NAME="deltagravity"
CONTAINER_NAME="deltagravity"
LOG_PATH="/home/cayetano/Proyectos/DeltaGravity/.deltagravity/watchdog.log"

mkdir -p "$(dirname "$LOG_PATH")"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" >> "$LOG_PATH"
}

if ! docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  log "container missing; recreating with docker compose up -d"
  cd "$COMPOSE_DIR"
  docker compose up -d "$SERVICE_NAME" >> "$LOG_PATH" 2>&1
  exit 0
fi

state="$(docker inspect --format '{{.State.Status}}' "$CONTAINER_NAME")"
health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME")"

if [[ "$state" != "running" ]]; then
  log "container state=$state; recreating with docker compose up -d"
  cd "$COMPOSE_DIR"
  docker compose up -d "$SERVICE_NAME" >> "$LOG_PATH" 2>&1
  exit 0
fi

if [[ "$health" == "unhealthy" ]]; then
  log "container unhealthy; restarting"
  docker restart "$CONTAINER_NAME" >> "$LOG_PATH" 2>&1
  exit 0
fi

log "container healthy enough; state=$state health=$health"
