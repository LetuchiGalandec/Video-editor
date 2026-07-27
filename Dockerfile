# syntax=docker/dockerfile:1

# --- Build stage: install the workspaces and compile the server ---
FROM node:22 AS build
WORKDIR /app
# Every workspace package.json must be present before `npm ci`, or the install
# fails on the workspace declarations in the root package.json.
COPY package*.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN npm ci
COPY . .
RUN npm run build -w server

# --- Runtime stage ---
FROM node:22-slim AS runtime
# Three packages, each load-bearing:
#  - ffmpeg    : trimming/re-encoding. The dynamically linked apt build is used
#                deliberately in place of the bundled ffmpeg-static one, which is
#                fully static and therefore cannot resolve hostnames (glibc NSS
#                dlopens its resolver at run time), breaking section downloads
#                with "Failed to resolve hostname ... System error".
#  - python3   : youtube-dl-exec ships yt-dlp as a Python zipapp
#                (#!/usr/bin/env python3); without it every fetch exits 127.
#  - ca-certificates : the slim image ships an empty /etc/ssl/certs and
#                --no-install-recommends will not pull this in, so yt-dlp's TLS
#                fails with CERTIFICATE_VERIFY_FAILED.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Baked so the image boots correctly even when .env omits them. DATA_DIR matters
# most: the app's default (SERVER_ROOT/.data) lives under root-owned /app, so a
# non-root user could not create it and the container would crash with EACCES.
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    DATA_DIR=/data
# npm workspaces hoist to the root node_modules on a clean install, so copying
# the build stage's tree carries every runtime dependency.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/package.json apps/server/package.json
# Drop root: this process runs ffmpeg over untrusted input. It only writes under
# /data, owned by the node user (uid 1000) that ships in the image.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/main.js"]
