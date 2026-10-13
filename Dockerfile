# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# The server is bundled into dist/; only the native sqlite binding is installed
# (it ships prebuilt binaries, so no compiler needed).
RUN mkdir /out \
 && cp -r apps/server/dist apps/server/drizzle /out/ \
 && cp -r apps/web/dist /out/web \
 && node -e "const v=require('./apps/server/package.json').dependencies['better-sqlite3']; \
      require('fs').writeFileSync('/out/package.json', JSON.stringify({type:'module',dependencies:{'better-sqlite3':v}}))" \
 && cd /out && npm install --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST=/app/web \
    MIGRATIONS_DIR=/app/drizzle
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/main.js"]
