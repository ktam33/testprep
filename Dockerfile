# syntax=docker/dockerfile:1

# Node 22 matches the better-sqlite3 prebuilt binaries, so the native module
# normally installs without compiling. The build tools below are the fallback
# for when it does have to build from source.
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# better-sqlite3 is in serverExternalPackages, so Next traces it into standalone
# rather than bundling it — verified to include build/Release/better_sqlite3.node
# along with its bindings/file-uri-to-path helpers, so no explicit copy is needed.

# db.ts resolves the database to `process.cwd()/data`, which is where the Fly
# volume mounts. Runs as root deliberately: Fly volumes mount root-owned, and a
# non-root user would need a chown-on-boot entrypoint to write to it.
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "server.js"]
