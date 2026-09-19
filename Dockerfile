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

# Patch the base image's OS packages to the latest available versions, so any
# vulnerability disclosed against the base layer is closed at build time.
RUN apk upgrade --no-cache

# Remove the package managers from the runtime image.
#
# The container's only job is to run `node src/server.js`; dependencies are
# installed in the deps stage above and copied in, so npm, npx, corepack and
# yarn are never invoked here. They were, however, the source of every finding
# the Trivy scan reported (11 vulnerabilities, 10 HIGH and 1 CRITICAL, all in
# npm's own bundled dependencies: tar, brace-expansion, sigstore, pacote,
# picomatch and ip-address) while the application's own dependencies were
# clean. Deleting them removes those findings and, more importantly, denies an
# attacker who achieves code execution in the container a ready-made tool for
# fetching and installing further payloads.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack \
           /opt/yarn-v* \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts

# Run as an unprivileged user; the node image already provides uid 1000 'node'.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# Docker restarts an unhealthy container, which is the first line of defence
# before the Prometheus alert rules fire. Node's built-in fetch is used rather
# than curl or wget so the runtime image needs no extra package installed
# purely for the health probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
