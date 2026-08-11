# Build context is the repo root (see docker-compose.yml) so a single root .dockerignore
# covers every service. This app is a standalone npm project (not a pnpm workspace member).
FROM node:26-bookworm-slim

WORKDIR /app

COPY examples/nestjs-drizzle-app/package.json examples/nestjs-drizzle-app/package-lock.json ./
RUN npm ci

COPY examples/nestjs-drizzle-app/ .

RUN chmod +x docker-entrypoint.sh

EXPOSE 3002
ENTRYPOINT ["./docker-entrypoint.sh"]
