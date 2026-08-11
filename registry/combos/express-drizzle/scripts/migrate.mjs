#!/usr/bin/env node
// Authors a migration for one variant and copies it back into the registry.
//
// `drizzle-kit` resolves `drizzle.config.ts` relative to its working directory, and that config's
// `schema`/`out` paths are relative too — so the only directory where they line up is the
// materialized variant. Migrations are therefore generated there and copied back into
// `variants/<variant>/drizzle`, which is what the CLI actually ships.
//
// Migrations are regenerated clean per variant, never amended with drop-column migrations: the
// CLI copies this directory verbatim into every consumer's repo. Pass `--fresh` to discard the
// variant's existing migrations first, which is what "regenerate clean" means in practice.
//
// Usage: node scripts/migrate.mjs [variant ...] [--name <migration-name>] [--fresh]
import { execFileSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { baseDatabaseUrl, databaseUrlFor, ensureDatabase, materialize, VARIANTS } from "./materialize.mjs";

const COMBO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const nameIndex = args.indexOf("--name");
const name = nameIndex === -1 ? "init" : args[nameIndex + 1];
const fresh = args.includes("--fresh");
const variants = args.filter((a, i) => !a.startsWith("--") && i !== nameIndex + 1);

for (const variant of variants.length ? variants : VARIANTS) {
  const registryMigrations = join(COMBO_ROOT, "variants", variant, "drizzle");
  if (fresh) await rm(registryMigrations, { recursive: true, force: true });

  const dest = await materialize(variant);
  await ensureDatabase(databaseUrlFor(variant, await baseDatabaseUrl()));

  execFileSync("npx", ["drizzle-kit", "generate", "--name", name], { cwd: dest, stdio: "inherit" });
  execFileSync("npx", ["drizzle-kit", "migrate"], { cwd: dest, stdio: "inherit" });

  await rm(registryMigrations, { recursive: true, force: true });
  await cp(join(dest, "drizzle"), registryMigrations, { recursive: true });
  console.log(`\nwrote migrations back to variants/${variant}/drizzle`);
}
