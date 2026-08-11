"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActionName, ServiceName, ServiceStatus, StatusReport } from "@/lib/services";

import { SchemaBand } from "./schema-band";
import { Controls, Lamp, StateLabel } from "./service-controls";

type ByName = Partial<Record<ServiceName, ServiceStatus>>;

const index = (report: StatusReport | null): ByName =>
  Object.fromEntries((report?.services ?? []).map((service) => [service.name, service]));

/** One cell of the framework × ORM matrix. */
function BackendCell({
  name,
  combo,
  port,
  reference,
  caveat,
  services,
  onAct,
}: {
  name: ServiceName;
  combo: string;
  port: number;
  reference?: boolean;
  caveat: React.ReactNode;
  services: ByName;
  onAct: (service: ServiceName, action: ActionName) => void;
}) {
  return (
    <article className={reference ? "cell is-ref" : "cell"}>
      <div className="cell-top">
        <h3 className="combo">{combo}</h3>
        {reference && <span className="tag">Reference</span>}
      </div>
      <div className="port">
        <Lamp service={services[name]} />
        {port}
      </div>
      <StateLabel service={services[name]} />
      <Controls name={name} service={services[name]} onAct={onAct} />
      <p className="caveat">{caveat}</p>
    </article>
  );
}

function ClientSurface({
  name,
  stack,
  port,
  services,
  onAct,
}: {
  name: ServiceName;
  stack: string;
  port: number;
  services: ByName;
  onAct: (service: ServiceName, action: ActionName) => void;
}) {
  return (
    <article className="surface">
      <h3>{name}</h3>
      <p className="stack">{stack}</p>
      <div className="port">
        <Lamp service={services[name]} />
        {port}
      </div>
      <StateLabel service={services[name]} />
      <Controls name={name} service={services[name]} onAct={onAct} />
    </article>
  );
}

export function Panel() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [message, setMessage] = useState("Checking…");
  const [tone, setTone] = useState<"bad" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const apply = useCallback((next: StatusReport) => {
    setReport(next);
    if (next.dockerError) {
      setTone("bad");
      setMessage("Docker is not responding");
      return;
    }
    setTone(null);
    const running = next.services.filter((service) => service.state === "running").length;
    setMessage(`${running} of ${next.services.length} running`);
  }, []);

  const refresh = useCallback(async () => {
    setMessage("Checking…");
    try {
      apply(await (await fetch("/api/status", { cache: "no-store" })).json());
    } catch {
      setTone("bad");
      setMessage("Control server unreachable");
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (service: ServiceName | "all", action: ActionName) => {
      setBusy(true);
      setTone(null);
      setMessage(`${action}ing ${service === "all" ? "everything" : service}…`);
      try {
        const response = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ service, action }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Command failed.");
        apply(result as StatusReport);
      } catch (error) {
        setTone("bad");
        setMessage((error as Error).message.slice(0, 80));
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const recheck = useCallback(() => {
    setReloadKey((key) => key + 1);
    void refresh();
  }, [refresh]);

  // The schema band needs Postgres up to replay anything, and this panel is
  // already the thing that can start it — so its empty state gets the button.
  const startPostgres = useCallback(async () => {
    await act("postgres", "start");
    setReloadKey((key) => key + 1);
  }, [act]);

  const services = index(report);

  return (
    <div className="wrap" data-busy={busy ? "true" : undefined}>
      <header className="masthead">
        <div>
          <h1 className="wordmark">
            easy<span>-</span>auth
          </h1>
          <p className="tagline">Local control panel · every surface in this repo</p>
        </div>
        <div className="master">
          <span className="readout" data-tone={tone ?? undefined}>
            {message}
          </span>
          <div className="master-btns">
            <button className="btn" type="button" onClick={() => act("all", "start")}>
              Start all
            </button>
            <button className="btn" type="button" onClick={() => act("all", "restart")}>
              Restart all
            </button>
            <button className="btn is-quiet" type="button" onClick={() => act("all", "rebuild")}>
              Rebuild all
            </button>
            <button className="btn is-danger" type="button" onClick={() => act("all", "stop")}>
              Stop all
            </button>
            <button className="btn is-quiet" type="button" onClick={recheck}>
              Re-check
            </button>
          </div>
        </div>
      </header>

      <section className="band">
        <div className="band-head">
          <h2>Backends — base variant</h2>
          <p>
            One core, copied into four wirings. Roles and permissions are global to the
            deployment. Pick the cell whose framework and ORM you want to work against.
          </p>
        </div>

        <div className="matrix">
          <div className="axis-orm">
            <span>Prisma</span>
            <span>Drizzle</span>
          </div>
          <div className="axis-fw">
            <span>NestJS</span>
            <span>Express</span>
          </div>

          <BackendCell
            name="nestjs-prisma-app"
            combo="nestjs-prisma"
            port={3001}
            reference
            services={services}
            onAct={act}
            caveat={<>The reference combo — the one the admin and mobile clients target by default.</>}
          />
          <BackendCell
            name="nestjs-drizzle-app"
            combo="nestjs-drizzle"
            port={3002}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Drizzle instead of Prisma.</>}
          />
          <BackendCell
            name="express-prisma-app"
            combo="express-prisma"
            port={3003}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Express instead of NestJS.</>}
          />
          <BackendCell
            name="express-drizzle-app"
            combo="express-drizzle"
            port={3004}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Express + Drizzle.</>}
          />
        </div>

        <div className="strip">
          <Lamp service={services.postgres} />
          <h3>postgres</h3>
          <StateLabel service={services.postgres} />
          <Controls name="postgres" service={services.postgres} onAct={act} />
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <h2>Backends — workspaces variant</h2>
          <p>
            Same four wirings, <code>--workspaces</code> variant: users belong to workspaces and
            hold different roles in each. Workspace-scoped requests carry an{" "}
            <code>X-Workspace-Id</code> header — <code>POST /workspaces</code> makes the caller
            its first admin.
          </p>
        </div>

        <div className="matrix">
          <div className="axis-orm">
            <span>Prisma</span>
            <span>Drizzle</span>
          </div>
          <div className="axis-fw">
            <span>NestJS</span>
            <span>Express</span>
          </div>

          <BackendCell
            name="nestjs-prisma-app-workspaces"
            combo="nestjs-prisma"
            port={3005}
            reference
            services={services}
            onAct={act}
            caveat={<>The reference combo&apos;s workspaces variant — targeted by admin-nextjs-workspaces and admin-react-workspaces.</>}
          />
          <BackendCell
            name="nestjs-drizzle-app-workspaces"
            combo="nestjs-drizzle"
            port={3006}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Drizzle instead of Prisma.</>}
          />
          <BackendCell
            name="express-prisma-app-workspaces"
            combo="express-prisma"
            port={3007}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Express instead of NestJS.</>}
          />
          <BackendCell
            name="express-drizzle-app-workspaces"
            combo="express-drizzle"
            port={3008}
            services={services}
            onAct={act}
            caveat={<>Structurally interchangeable with the reference — Express + Drizzle.</>}
          />
        </div>
      </section>

      <SchemaBand reloadKey={reloadKey} onStartPostgres={() => void startPostgres()} />

      <section className="band">
        <div className="band-head">
          <h2>Clients — base variant</h2>
          <p>
            All talk to <code>nestjs-prisma</code> on 3001. The two mobile apps need a simulator,
            so they open from a terminal rather than from here.
          </p>
        </div>

        <div className="surfaces">
          <ClientSurface
            name="admin-nextjs"
            stack="Next.js · MobX · CASL · Tailwind v4"
            port={3000}
            services={services}
            onAct={act}
          />
          <ClientSurface
            name="admin-react"
            stack="Vite · React · MobX · CASL · Tailwind v4"
            port={5173}
            services={services}
            onAct={act}
          />
          <article className="surface">
            <h3>mobile-expo</h3>
            <p className="stack">Expo · Zustand · NativeWind 5</p>
            <p className="native">
              Runs on a simulator or Expo Go:
              <code>cd apps/mobile-expo &amp;&amp; npm run start</code>
            </p>
          </article>
          <article className="surface">
            <h3>mobile-bare-rn</h3>
            <p className="stack">React Native CLI · Zustand · NativeWind 5</p>
            <p className="native">
              Needs Xcode or Android Studio:
              <code>cd apps/mobile-bare-rn &amp;&amp; npm run ios</code>
            </p>
          </article>
        </div>
      </section>

      <section className="band">
        <div className="band-head">
          <h2>Clients — workspaces variant</h2>
          <p>
            All talk to <code>nestjs-prisma-app-workspaces</code> on 3005.
          </p>
        </div>

        <div className="surfaces">
          <ClientSurface
            name="admin-nextjs-workspaces"
            stack="Next.js · MobX · CASL · Tailwind v4"
            port={3010}
            services={services}
            onAct={act}
          />
          <ClientSurface
            name="admin-react-workspaces"
            stack="Vite · React · MobX · CASL · Tailwind v4"
            port={5174}
            services={services}
            onAct={act}
          />
          <article className="surface">
            <h3>mobile-expo-workspaces</h3>
            <p className="stack">Expo · Zustand · NativeWind 5</p>
            <p className="native">
              Runs on a simulator or Expo Go:
              <code>cd apps/mobile-expo-workspaces &amp;&amp; npm run start</code>
            </p>
          </article>
          <article className="surface">
            <h3>mobile-bare-rn-workspaces</h3>
            <p className="stack">React Native CLI · Zustand · NativeWind 5</p>
            <p className="native">
              Needs Xcode or Android Studio:
              <code>cd apps/mobile-bare-rn-workspaces &amp;&amp; npm run ios</code>
            </p>
          </article>
        </div>
      </section>

      <footer className="colophon">
        <div>
          <h4>What the buttons do</h4>
          <p>
            Start, stop, and restart run <code>docker compose</code> in this repo. Images build
            on first start, so give <b>Start all</b> a minute the first time.
          </p>
        </div>
        <div>
          <h4>Database</h4>
          <p>
            Postgres stays on the compose network only. It is not published to the host, so it
            won&apos;t collide with your own Postgres on 55432.
          </p>
        </div>
        <div>
          <h4>Before you change anything</h4>
          <p>
            Read <code>plan/brief.md</code> — settled decisions, current state, and what&apos;s
            still open.
          </p>
        </div>
      </footer>
    </div>
  );
}
