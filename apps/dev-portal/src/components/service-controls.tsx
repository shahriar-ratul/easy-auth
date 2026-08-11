"use client";

import type { ActionName, ServiceName, ServiceStatus } from "@/lib/services";

/** Where each service's real surface lives — the backends serve nothing at `/`. */
const LINKS: Partial<Record<ServiceName, [string, string][]>> = {
  "nestjs-prisma-app": [
    ["Swagger UI", "http://localhost:3001/docs"],
    ["Spec", "http://localhost:3001/docs-json"],
  ],
  "nestjs-drizzle-app": [
    ["Swagger UI", "http://localhost:3002/docs"],
    ["Spec", "http://localhost:3002/docs-json"],
  ],
  "express-prisma-app": [
    ["Swagger UI", "http://localhost:3003/docs"],
    ["Spec", "http://localhost:3003/docs-json"],
  ],
  "express-drizzle-app": [
    ["Swagger UI", "http://localhost:3004/docs"],
    ["Spec", "http://localhost:3004/docs-json"],
  ],
  "nestjs-prisma-app-workspaces": [
    ["Swagger UI", "http://localhost:3005/docs"],
    ["Spec", "http://localhost:3005/docs-json"],
  ],
  "nestjs-drizzle-app-workspaces": [
    ["Swagger UI", "http://localhost:3006/docs"],
    ["Spec", "http://localhost:3006/docs-json"],
  ],
  "express-prisma-app-workspaces": [
    ["Swagger UI", "http://localhost:3007/docs"],
    ["Spec", "http://localhost:3007/docs-json"],
  ],
  "express-drizzle-app-workspaces": [
    ["Swagger UI", "http://localhost:3008/docs"],
    ["Spec", "http://localhost:3008/docs-json"],
  ],
  "admin-nextjs": [["Open console", "http://localhost:3000"]],
  "admin-react": [["Open console", "http://localhost:5173"]],
  "admin-nextjs-workspaces": [["Open console", "http://localhost:3010"]],
  "admin-react-workspaces": [["Open console", "http://localhost:5174"]],
};

export type LampState = "up" | "warn" | "down" | "unknown";

export function describe(service: ServiceStatus | undefined): [LampState, string] {
  if (!service) return ["unknown", "Checking…"];
  const { state, responding, port } = service;
  // Postgres publishes no port, so there's nothing to probe — for it, the
  // container being up is the whole answer.
  if (state === "running" && (responding || port === null)) return ["up", "Running"];
  if (state === "running") return ["warn", "Starting…"];
  if (state === "exited") return ["down", "Stopped"];
  // Not a compose container, but something is on the port — a local `npm run
  // start` outside Docker. Worth saying plainly: the buttons won't touch it.
  if (responding) return ["warn", "Outside Docker"];
  return ["down", "Not started"];
}

export function Lamp({ service }: { service: ServiceStatus | undefined }) {
  const [state] = describe(service);
  return <span className="lamp" data-state={state === "unknown" ? undefined : state} />;
}

export function StateLabel({ service }: { service: ServiceStatus | undefined }) {
  const [, label] = describe(service);
  return <p className="state">{label}</p>;
}

export function Controls({
  name,
  service,
  onAct,
}: {
  name: ServiceName;
  service: ServiceStatus | undefined;
  onAct: (service: ServiceName, action: ActionName) => void;
}) {
  const actions: ActionName[] =
    service?.state === "running" ? ["restart", "rebuild", "stop"] : ["start", "rebuild"];

  return (
    <div className="controls">
      {(LINKS[name] ?? []).map(([text, href]) => (
        <a
          key={href}
          className="btn"
          href={href}
          aria-disabled={service?.responding ? undefined : "true"}
        >
          {text}
        </a>
      ))}
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className={action === "stop" ? "btn is-quiet is-danger" : "btn is-quiet"}
          onClick={() => onAct(name, action)}
        >
          {action[0].toUpperCase() + action.slice(1)}
        </button>
      ))}
    </div>
  );
}
