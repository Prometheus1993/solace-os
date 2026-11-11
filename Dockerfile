# Solace in one container: API server + Vite web UI, the same two processes as `npm start`.
# Build deps live only in the first stage; better-sqlite3 is compiled there if no prebuilt binary fits.
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/core/package.json backend/core/
COPY backend/data/package.json backend/data/
COPY backend/server/package.json backend/server/
COPY backend/cli/package.json backend/cli/
COPY frontend/package.json frontend/
# Only the manifest, so `npm ci` can resolve the workspace; the Mac app itself is not part of the image.
COPY desktop/package.json desktop/
RUN npm ci

FROM node:22-bookworm-slim
# uv runs the optional Garmin sync (garmin_fetch.py); it is unused in demo mode.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .
ENV SOLACE_DEMO=1
EXPOSE 5174
CMD ["bash", "docker-entrypoint.sh"]
