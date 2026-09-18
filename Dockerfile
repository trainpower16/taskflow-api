# ---------- Stage 1: install production dependencies ----------
# Kept separate so the runtime image never contains the build toolchain or the
# dev dependencies (jest, eslint), which shrinks both the image and the attack
# surface that the Security stage has to scan.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ARG APP_VERSION=1.0.0
ARG BUILD_NUMBER=local
ARG GIT_COMMIT=unknown

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION} \
    BUILD_NUMBER=${BUILD_NUMBER} \
    GIT_COMMIT=${GIT_COMMIT} \
    DATABASE_FILE=/app/data/taskflow.db

# These labels let the Release stage trace a running container back to the exact
# pipeline build and commit that produced it.
LABEL org.opencontainers.image.title="taskflow-api" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/your-username/taskflow-api"

RUN apk add --no-cache wget

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Run as an unprivileged user; the node image already provides uid 1000 'node'.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# Docker restarts an unhealthy container, which is the first line of defence
# before the Prometheus alert rules fire.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "src/server.js"]
