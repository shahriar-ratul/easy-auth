"use client";

import { useEffect, useState } from "react";

import { COMBOS, REFERENCE_COMBO, type ComboName, type DriftRow, type SchemaReport } from "@/lib/types";

/** The value most combos share on this row; anything else is the outlier. */
function majority(row: DriftRow): string | null {
  const tally = new Map<string | null, number>();
  for (const combo of COMBOS) {
    const value = row.variants[combo];
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function DriftTable({ rows }: { rows: DriftRow[] }) {
  return (
    <div className="drift-table-wrap">
      <table className="drift">
        <caption>Columns the four combos disagree on</caption>
        <thead>
          <tr>
            <th scope="col">Column</th>
            {COMBOS.map((combo) => (
              <th key={combo} scope="col" className={combo === REFERENCE_COMBO ? "is-ref" : undefined}>
                {combo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const common = majority(row);
            return (
              <tr key={`${row.table}.${row.column}`}>
                <td className="col">
                  {row.table}.<b>{row.column}</b>
                </td>
                {COMBOS.map((combo) => {
                  const value = row.variants[combo];
                  const classes = ["val"];
                  if (value === null) classes.push("is-missing");
                  else if (value !== common) classes.push("is-odd");
                  return (
                    <td key={combo} className={classes.join(" ")}>
                      {value ?? "absent"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Diagram({ combo }: { combo: ComboName }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSvg(null);
    setError(null);
    fetch(`/api/schema/diagram?combo=${combo}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.text();
        if (!response.ok) throw new Error(body.slice(0, 200));
        if (live) setSvg(body);
      })
      .catch((cause: Error) => live && setError(cause.message));
    return () => {
      live = false;
    };
  }, [combo]);

  if (error) return <div className="canvas-empty">Couldn&apos;t draw {combo}: {error}</div>;
  if (!svg) return <div className="canvas-empty">Drawing {combo}…</div>;
  // Server-rendered from this repo's own migration files, then recoloured to the
  // panel palette — the only markup here is what graphviz emitted.
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * The schema is built by replaying the migrations through Postgres, so with
 * Postgres down there is no answer to give. Saying that plainly — and offering
 * the one button that fixes it — beats showing an approximate schema a reader
 * would take for fact.
 */
function PostgresDown({ reason, onStart }: { reason: string; onStart: () => void }) {
  return (
    <div className="canvas">
      <div className="canvas-empty">
        <p className="canvas-empty-lead">Start Postgres to compare schemas</p>
        <p>
          Every combo&apos;s migrations are replayed into a throwaway database and the result
          introspected, so this needs Postgres running.
        </p>
        <button className="btn" type="button" onClick={onStart}>
          Start Postgres
        </button>
        <p className="canvas-empty-why">{reason}</p>
      </div>
    </div>
  );
}

export function SchemaBand({
  reloadKey,
  onStartPostgres,
}: {
  reloadKey: number;
  onStartPostgres: () => void;
}) {
  const [report, setReport] = useState<SchemaReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [combo, setCombo] = useState<ComboName>(REFERENCE_COMBO);

  useEffect(() => {
    let live = true;
    setReport(null);
    setFailure(null);
    // Re-check replays rather than reusing the cached run — it's the button you
    // press after editing a migration or starting Postgres.
    fetch(reloadKey > 0 ? "/api/schema?refresh=1" : "/api/schema", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SchemaReport & { error?: string }) => {
        if (!live) return;
        if (data.error) setFailure(data.error);
        else setReport(data);
      })
      .catch(() => live && setFailure("Control server unreachable."));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  return (
    <section className="band">
      <div className="band-head">
        <h2>Schema</h2>
        <p>
          Every combo&apos;s migration files, replayed into a throwaway database and
          introspected — so an <code>ALTER TABLE</code> in a later migration counts for exactly
          as much as the <code>CREATE TABLE</code> it amends, and this shows what the repo
          declares rather than what someone migrated by hand.
        </p>
      </div>

      <p className="drift-note">
        {failure ? (
          failure
        ) : report?.unavailable ? (
          <>Postgres isn&apos;t running, so the migrations can&apos;t be replayed.</>
        ) : report ? (
          <>
            <b>
              {report.tableCount} tables, {report.columnCount} columns.
            </b>{" "}
            {report.driftCount > 0 ? (
              <>
                <span className="chip">{report.driftCount} disagree</span> between the four
                combos — highlighted in the diagram and listed below.
              </>
            ) : (
              <>All four combos agree on every column.</>
            )}
          </>
        ) : (
          "Replaying the migrations…"
        )}
      </p>

      {report?.unavailable && (
        <PostgresDown reason={report.unavailable} onStart={onStartPostgres} />
      )}

      {report && !report.unavailable && (
        <>
          {report.warnings.length > 0 && (
            <div className="notices">
              {report.warnings.map((warning) => (
                <p className="notice" key={warning}>
                  <b>Repo defect</b>
                  <span>{warning}</span>
                </p>
              ))}
            </div>
          )}

          <div className="tabs" role="group" aria-label="Which combo's migrations to draw">
            <span className="tab-label">Drawn from</span>
            {COMBOS.map((name) => (
              <button
                key={name}
                type="button"
                className="btn is-quiet"
                aria-pressed={name === combo}
                onClick={() => setCombo(name)}
              >
                {name}
                {name === REFERENCE_COMBO ? " ·ref" : ""}
              </button>
            ))}
          </div>

          <div className="canvas">
            <Diagram combo={combo} />
          </div>

          {report.drift.length > 0 && <DriftTable rows={report.drift} />}
        </>
      )}
    </section>
  );
}
