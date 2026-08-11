#!/bin/sh
# Runs at container startup (not image build time) — Postgres is only reachable once the
# container is up, and compose's `depends_on: condition: service_healthy` already ensures
# the DB is accepting connections before this script runs.
#
# drizzle.config.ts lives at src/lib/auth/drizzle.config.ts and drizzle-kit resolves
# ./drizzle and ./src/schema.ts relative to the working directory, so this must run from
# src/lib/auth (same working-directory requirement as the non-Docker workflow in the README).
set -e

(cd src/lib/auth && npx drizzle-kit migrate)

exec npm run start
