#!/usr/bin/env bash
set -euo pipefail

: "${REMOTE_DIR:?REMOTE_DIR es obligatorio}"
: "${REMOTE_HOME:?REMOTE_HOME es obligatorio}"
: "${MODEL:?MODEL es obligatorio}"

cd "$REMOTE_DIR"

sudo -v

replace_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=\"${value}\"#" .env
  else
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}

replace_env_raw() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

mkdir -p .deltagravity scripts

sed -i "s#/home/cayetano#${REMOTE_HOME//\//\\/}#g" docker-compose.yml

if ! grep -q 'host.docker.internal:host-gateway' docker-compose.yml; then
  perl -0pi -e 's/env_file:\n\s+- \.env/env_file:\n      - .env\n    extra_hosts:\n      - "host.docker.internal:host-gateway"/' docker-compose.yml
fi

replace_env_raw "AGENT_BACKEND" "ollama"
replace_env "OLLAMA_BASE_URL" "http://host.docker.internal:11434"
replace_env "OLLAMA_MODEL" "$MODEL"
replace_env "CODEX_DEFAULT_CWD" "$REMOTE_HOME/Proyectos"
replace_env "SELF_REPO_PATH" "$REMOTE_DIR"
replace_env "SELF_DOCKER_COMPOSE_DIR" "$REMOTE_DIR"
replace_env "GOOGLE_APPLICATION_CREDENTIALS" "/app/service-account.json"

cat > scripts/watchdog.sh <<WATCHDOG
#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="$REMOTE_DIR"
SERVICE_NAME="deltagravity"
CONTAINER_NAME="deltagravity"
LOG_PATH="$REMOTE_DIR/.deltagravity/watchdog.log"

mkdir -p "\$(dirname "\$LOG_PATH")"

log() {
  printf '[%s] %s\n' "\$(date -Is)" "\$*" >> "\$LOG_PATH"
}

if ! docker inspect "\$CONTAINER_NAME" >/dev/null 2>&1; then
  log "container missing; recreating with docker compose up -d"
  cd "\$COMPOSE_DIR"
  docker compose up -d "\$SERVICE_NAME" >> "\$LOG_PATH" 2>&1
  exit 0
fi

state="\$(docker inspect --format '{{.State.Status}}' "\$CONTAINER_NAME")"
health="\$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "\$CONTAINER_NAME")"

if [[ "\$state" != "running" ]]; then
  log "container state=\$state; recreating with docker compose up -d"
  cd "\$COMPOSE_DIR"
  docker compose up -d "\$SERVICE_NAME" >> "\$LOG_PATH" 2>&1
  exit 0
fi

if [[ "\$health" == "unhealthy" ]]; then
  log "container unhealthy; restarting"
  docker restart "\$CONTAINER_NAME" >> "\$LOG_PATH" 2>&1
  exit 0
fi

log "container healthy enough; state=\$state health=\$health"
WATCHDOG
chmod +x scripts/watchdog.sh

cat > deltagravity.service <<SERVICE
[Unit]
Description=DeltaGravity Docker Compose Service
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
SERVICE

cat > deltagravity-watchdog.service <<WATCHDOG_SERVICE
[Unit]
Description=DeltaGravity container watchdog
After=docker.service deltagravity.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$REMOTE_DIR
ExecStart=$REMOTE_DIR/scripts/watchdog.sh
WATCHDOG_SERVICE

cat > deltagravity-watchdog.timer <<TIMER
[Unit]
Description=Run DeltaGravity watchdog periodically

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Unit=deltagravity-watchdog.service

[Install]
WantedBy=timers.target
TIMER

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama no está instalado en el remoto." >&2
  exit 1
fi

sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<OLLAMA_OVERRIDE
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
OLLAMA_OVERRIDE

sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sudo systemctl restart ollama

curl -fsS http://127.0.0.1:11434/api/tags >/dev/null

if ! ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  ollama pull "$MODEL"
fi

sudo systemctl disable --now deltagravity-watchdog.timer 2>/dev/null || true
sudo systemctl disable --now deltagravity.service 2>/dev/null || true
sudo docker rm -f deltagravity 2>/dev/null || true

sudo docker compose -f docker-compose.yml up -d --build --force-recreate

sudo cp deltagravity.service /etc/systemd/system/deltagravity.service
sudo cp deltagravity-watchdog.service /etc/systemd/system/deltagravity-watchdog.service
sudo cp deltagravity-watchdog.timer /etc/systemd/system/deltagravity-watchdog.timer
sudo systemctl daemon-reload
sudo systemctl enable --now deltagravity.service
sudo systemctl enable --now deltagravity-watchdog.timer

sudo docker ps --filter name=^/deltagravity$ --format '{{.Names}}|{{.Image}}|{{.Status}}'
sudo docker exec deltagravity curl -fsS http://host.docker.internal:11434/api/tags >/dev/null
