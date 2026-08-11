#!/usr/bin/env node
// Local-invocation CLI: run directly against this registry repo, e.g.
// `pnpm --filter easy-auth-cli run cli -- add nestjs-prisma --into ../my-app`.
//
// A combo ships in variants (see registry/README.md). `add <combo>` emits the default one;
// `add <combo> --workspaces` emits the workspace variant, composed by copying the combo's
// `shared/` directory and then `variants/<variant>/` over the top.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, CopyResult, pruneRemovedFiles } from "./lib/copy.js";

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = resolve(CLI_DIR, "..", "registry");
const CONFIG_FILENAME = ".easy-auth.json";
const DEFAULT_VARIANT = "base";

/** Flags that take no value. Everything else consumes the next argv entry. */
const BOOLEAN_FLAGS = new Set(["workspaces", "force"]);

interface EasyAuthConfig {
  path: string;
  alias: string;
  /** Paths (relative to the install directory) the CLI must never write or delete. */
  ignore: string[];
}

interface ComboEntry {
  dir: string;
  sharedDir?: string;
  variantsDir?: string;
  variants: string[];
  peerDependencies: string[];
  postInstall: string[];
  variantPostInstall?: Record<string, string[]>;
}

interface Registry {
  core: { dir: string; peerDependencies: string[] };
  variants: Record<string, { flag: string | null; description: string }>;
  combos: Record<string, ComboEntry>;
}

interface AuthLock {
  combo?: string;
  variant?: string;
  installedAt?: string;
  files?: Record<string, string>;
}

const DEFAULT_CONFIG: EasyAuthConfig = { path: "src/lib/auth", alias: "@/lib/auth", ignore: [] };

function parseArgs(argv: string[]): { command?: string; positional: string[]; flags: Record<string, string | true> } {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        flags[name] = rest[i + 1];
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, flags };
}

const flagString = (value: string | true | undefined): string | undefined => (typeof value === "string" ? value : undefined);

async function loadRegistry(): Promise<Registry> {
  return JSON.parse(await readFile(join(CLI_DIR, "registry.json"), "utf8"));
}

async function loadConfig(targetRoot: string): Promise<EasyAuthConfig> {
  try {
    const raw = await readFile(join(targetRoot, CONFIG_FILENAME), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadLock(targetRoot: string): Promise<AuthLock> {
  try {
    return JSON.parse(await readFile(join(targetRoot, "auth.lock.json"), "utf8"));
  } catch {
    return {};
  }
}

async function cmdInit(targetRoot: string, flags: Record<string, string | true>) {
  const config: EasyAuthConfig = {
    path: flagString(flags.path) ?? DEFAULT_CONFIG.path,
    alias: flagString(flags.alias) ?? DEFAULT_CONFIG.alias,
    ignore: [],
  };
  await writeFile(join(targetRoot, CONFIG_FILENAME), JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Wrote ${CONFIG_FILENAME} — combos will install into ${config.path} (import alias ${config.alias})`);
}

function resolveVariant(combo: ComboEntry, comboName: string, flags: Record<string, string | true>): string | null {
  const requested = flags.workspaces === true ? "workspaces" : (flagString(flags.variant) ?? DEFAULT_VARIANT);

  if (combo.variants.length === 0) {
    console.error(`Combo "${comboName}" has not been migrated to the variant layout yet (see registry/README.md) — nothing to install.`);
    return null;
  }
  if (!combo.variants.includes(requested)) {
    console.error(`Combo "${comboName}" has no "${requested}" variant. Available: ${combo.variants.join(", ")}`);
    return null;
  }
  return requested;
}

async function cmdAdd(comboName: string, targetRoot: string, flags: Record<string, string | true>) {
  const registry = await loadRegistry();
  const combo = registry.combos[comboName];
  if (!combo) {
    console.error(`Unknown combo "${comboName}". Available: ${Object.keys(registry.combos).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const variant = resolveVariant(combo, comboName, flags);
  if (!variant) {
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig(targetRoot);
  const installPath = flagString(flags.path) ?? config.path;
  const alias = flagString(flags.alias) ?? config.alias;
  const destRoot = resolve(targetRoot, installPath);

  const lock = await loadLock(targetRoot);
  const previous = lock.files ?? {};
  const force = flags.force === true;

  const copyOpts = { aliasFrom: "@/lib/auth/core", aliasTo: `${alias}/core`, previous, force, ignore: config.ignore };
  const result: CopyResult = { manifest: {}, skipped: [], ignored: [] };

  const comboDir = join(REGISTRY_ROOT, combo.dir);
  await copyDir(join(REGISTRY_ROOT, registry.core.dir), join(destRoot, "core"), copyOpts, destRoot, result);
  await copyDir(join(comboDir, combo.sharedDir ?? "shared"), destRoot, copyOpts, destRoot, result);
  await copyDir(join(comboDir, combo.variantsDir ?? "variants", variant), destRoot, copyOpts, destRoot, result);

  // Switching variants has to remove the old variant's files, or the project ends up with both wired in.
  const pruned = await pruneRemovedFiles(destRoot, previous, result, { force, ignore: config.ignore });

  await writeFile(
    join(targetRoot, "auth.lock.json"),
    JSON.stringify({ ...lock, combo: comboName, variant, installedAt: new Date().toISOString(), files: result.manifest }, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nInstalled "${comboName}" (${variant} variant) into ${installPath} (alias ${alias})`);
  if (result.skipped.length) {
    console.log(`\nLeft alone — modified since the last install (re-run with --force to overwrite):`);
    for (const file of result.skipped) console.log(`  ${file}`);
  }
  if (result.ignored.length) {
    console.log(`\nLeft alone — on the ignore list in ${CONFIG_FILENAME}:`);
    for (const file of result.ignored) console.log(`  ${file}`);
  }
  if (pruned.removed.length) {
    console.log(`\nRemoved — no longer part of this install:`);
    for (const file of pruned.removed) console.log(`  ${file}`);
  }
  if (pruned.keptModified.length) {
    console.log(`\nNo longer part of this install, but modified locally, so kept (delete by hand if you don't want them):`);
    for (const file of pruned.keptModified) console.log(`  ${file}`);
  }

  const peerDeps = [...new Set([...registry.core.peerDependencies, ...combo.peerDependencies])];
  console.log(`\nInstall peer dependencies:\n  npm install ${peerDeps.join(" ")}`);

  const notes = [...combo.postInstall, ...(combo.variantPostInstall?.[variant] ?? [])];
  if (notes.length) {
    console.log(`\nNext steps:`);
    for (const note of notes) console.log(`  - ${note}`);
  }
}

async function cmdDiff(targetRoot: string) {
  const lock = await loadLock(targetRoot);
  if (!lock.files) {
    console.error(`No auth.lock.json found in ${targetRoot} — nothing installed yet.`);
    return;
  }
  console.log(`diff is not implemented yet (deferred until there's more than one install to maintain) — installed files:`);
  console.log(`  combo: ${lock.combo}, variant: ${lock.variant ?? DEFAULT_VARIANT}`);
  for (const file of Object.keys(lock.files)) console.log(`  ${file}`);
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const targetRoot = resolve(process.cwd(), flagString(flags.into) ?? ".");

  switch (command) {
    case "init":
      await cmdInit(targetRoot, flags);
      break;
    case "add": {
      const comboName = positional[0];
      if (!comboName) {
        console.error("Usage: easy-auth add <combo> [--workspaces] [--force] [--into <path>] [--path <dir>] [--alias <alias>]");
        process.exitCode = 1;
        break;
      }
      await cmdAdd(comboName, targetRoot, flags);
      break;
    }
    case "diff":
      await cmdDiff(targetRoot);
      break;
    default: {
      const registry = await loadRegistry();
      console.log("Usage: easy-auth <init|add|diff> [...]");
      console.log(`Available combos: ${Object.keys(registry.combos).join(", ")}`);
      console.log(`\nVariants (choose one at install time):`);
      for (const [name, variant] of Object.entries(registry.variants)) {
        console.log(`  ${name}${variant.flag ? ` (${variant.flag})` : " (default)"} — ${variant.description}`);
      }
      process.exitCode = command ? 1 : 0;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
