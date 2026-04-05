FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    docker.io \
    docker-compose \
    findutils \
    g++ \
    git \
    iputils-ping \
    jq \
    less \
    procps \
    python3 \
    make \
    ripgrep \
    tree \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src
COPY mcp.json ./

RUN npm run build

CMD ["node", "dist/index.js"]
