# Build context is the repo root (see docker-compose.yml) so a single root .dockerignore
# covers every service. This app is a standalone npm project (not a pnpm workspace member).
FROM node:26-bookworm-slim

WORKDIR /app

COPY examples/express-drizzle-app-workspaces/package.json examples/express-drizzle-app-workspaces/package-lock.json ./
RUN npm ci

COPY examples/express-drizzle-app-workspaces/ .

RUN chmod +x docker-entrypoint.sh

EXPOSE 3008
ENTRYPOINT ["./docker-entrypoint.sh"]
