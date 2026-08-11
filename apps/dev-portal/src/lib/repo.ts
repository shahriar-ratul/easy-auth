import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Absolute path to the monorepo root — the directory `docker compose` has to run
 * in, and the base for every migration path.
 *
 * Walked up from cwd rather than derived from this file's location, because the
 * compiled output of a route handler doesn't sit at a fixed depth under the app.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Can't find the repo root (no pnpm-workspace.yaml above cwd).");
    }
    dir = parent;
  }
}

export const REPO_ROOT = findRepoRoot();
