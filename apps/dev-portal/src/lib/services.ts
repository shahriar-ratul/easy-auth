import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { REPO_ROOT } from "./repo";

const exec = promisify(execFile);

/**
 * The compose services this panel is allowed to touch, and the host port each
 * one publishes. Requests are matched against this map before anything reaches
 * `docker compose`, so a request can never name an arbitrary container or
 * smuggle in a flag like `--volumes`.
 */
export const SERVICES = {
  postgres: { port: null },
  "nestjs-prisma-app": { port: 3001 },
  "nestjs-drizzle-app": { port: 3002 },
  "express-prisma-app": { port: 3003 },
  "express-drizzle-app": { port: 3004 },
  "nestjs-prisma-app-workspaces": { port: 3005 },
  "nestjs-drizzle-app-workspaces": { port: 3006 },
  "express-prisma-app-workspaces": { port: 3007 },
  "express-drizzle-app-workspaces": { port: 3008 },
  "admin-nextjs": { port: 3000 },
  "admin-react": { port: 5173 },
  "admin-nextjs-workspaces": { port: 3010 },
  "admin-react-workspaces": { port: 5174 },
} as const satisfies Record<string, { port: number | null }>;

export type ServiceName = keyof typeof SERVICES;
export type ContainerState = "running" | "exited" | "absent" | (string & {});

export type ServiceStatus = {
  name: ServiceName;
  port: number | null;
  state: ContainerState;
  /** null when the service publishes no port, so there is nothing to probe. */
  responding: boolean | null;
};

export type StatusReport = {
  services: ServiceStatus[];
  dockerError: string | null;
};

/** `all` plus every allowlisted service — nothing else is a legal target. */
export function isServiceTarget(value: unknown): value is ServiceName | "all" {
  return typeof value === "string" && (value === "all" || Object.hasOwn(SERVICES, value));
}

/**
 * Every argument list is built here from a fixed verb, never from request text:
 * the service name is the only variable part and it is allowlisted above.
 */
export const ACTIONS = {
  start: (service: string) => (service === "all" ? ["up", "-d"] : ["up", "-d", service]),
  stop: (service: string) => (service === "all" ? ["stop"] : ["stop", service]),
  restart: (service: string) => (service === "all" ? ["restart"] : ["restart", service]),
  // `restart` reuses whatever image is already built — it never picks up source changes. This
  // rebuilds the image first, then recreates the container from it. `postgres` has no build
  // context (it's the public image), so rebuilding it is a harmless no-op.
  rebuild: (service: string) => (service === "all" ? ["up", "-d", "--build"] : ["up", "-d", "--build", service]),
} as const;

export type ActionName = keyof typeof ACTIONS;

/** Rebuilding compiles a Docker image from scratch layers, not just a container restart. */
const ACTION_TIMEOUT: Partial<Record<ActionName, number>> = { rebuild: 600_000 };

export function isAction(value: unknown): value is ActionName {
  return typeof value === "string" && Object.hasOwn(ACTIONS, value);
}

/** `execFile` with an argument array — no shell, so no interpolation to escape. */
function compose(args: string[], timeout = 180_000) {
  return exec("docker", ["compose", ...args], { cwd: REPO_ROOT, timeout });
}

function detail(error: unknown): string {
  const shell = error as { stderr?: string; message?: string };
  return shell.stderr?.trim() || shell.message || String(error);
}

export async function runAction(action: ActionName, service: ServiceName | "all") {
  try {
    await compose(ACTIONS[action](service), ACTION_TIMEOUT[action] ?? 180_000);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: detail(error) };
  }
}

/** Container state per compose service: running | exited | absent. */
async function containerStates(): Promise<{
  states: Record<ServiceName, ContainerState>;
  dockerError: string | null;
}> {
  const states = Object.fromEntries(
    Object.keys(SERVICES).map((name) => [name, "absent"]),
  ) as Record<ServiceName, ContainerState>;

  try {
    // NDJSON: one JSON object per line, each with Service and State.
    const { stdout } = await compose(["ps", "-a", "--format", "json"]);
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      try {
        const { Service, State } = JSON.parse(line) as { Service?: string; State?: string };
        if (Service && Object.hasOwn(states, Service)) {
          states[Service as ServiceName] = State || "absent";
        }
      } catch {
        // A malformed line means one container's status is unknown, not that the
        // whole sweep failed — skip it and keep the rest.
      }
    }
  } catch (error) {
    // Docker itself is unreachable (daemon down, not installed). Surface that to
    // the UI rather than reporting every service as merely "absent".
    return { states, dockerError: detail(error) };
  }
  return { states, dockerError: null };
}

/** Does something answer on this port? Anything at all counts, including a 404. */
async function reachable(port: number | null): Promise<boolean | null> {
  if (port === null) return null;
  try {
    // The backends serve nothing at `/` — their real surface is `/docs` — so a
    // 404 here is the normal healthy answer.
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    return true;
  } catch (error) {
    // A non-HTTP reply still proves something is listening; only a refused
    // connection (or silence) means nothing is there.
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "ECONNREFUSED") return false;
    return (error as Error).name !== "TimeoutError";
  }
}

export async function status(): Promise<StatusReport> {
  const { states, dockerError } = await containerStates();
  const services = await Promise.all(
    (Object.entries(SERVICES) as [ServiceName, { port: number | null }][]).map(
      async ([name, { port }]) => ({
        name,
        port,
        state: states[name],
        responding: await reachable(port),
      }),
    ),
  );
  return { services, dockerError };
}
