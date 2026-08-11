-- Runs once, on first boot of an empty postgres data volume (docker-entrypoint-initdb.d
-- convention). Creates one database per example backend; each app's own migration
-- tooling (prisma migrate deploy / drizzle-kit migrate) creates the tables inside it.
CREATE DATABASE example_nestjs_prisma;
CREATE DATABASE example_nestjs_drizzle;
CREATE DATABASE example_express_prisma;
CREATE DATABASE example_express_drizzle;
CREATE DATABASE example_nestjs_prisma_workspaces;
CREATE DATABASE example_nestjs_drizzle_workspaces;
CREATE DATABASE example_express_prisma_workspaces;
CREATE DATABASE example_express_drizzle_workspaces;
