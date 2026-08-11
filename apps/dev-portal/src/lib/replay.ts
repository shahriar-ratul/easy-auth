import { spawn } from "node:child_process";

import { importer } from "@dbml/core";

import type { MigrationFile, MigrationSet } from "./migrations";
import { REPO_ROOT } from "./repo";
import type { ComboName } from "./types";

/**
 * Why the schema is replayed instead of parsed.
 *
 * The obvious implementation — concatenate a combo's migration SQL and hand it
 * to `@dbml/core`'s importer — silently reads only `CREATE TABLE`. It drops
 * `ALTER TABLE ... ADD COLUMN` / `ALTER COLUMN` on the floor, so every column
 * introduced by a later migration simply vanishes: the Prisma combos add
 * `User.twoFactorEnabled` and `User.twoFactorSecret` in their second migration
 * and the panel reported them as *absent*, which is the worst possible lie for
 * a view whose entire job is saying what's missing.
 *
 * Special-casing `ADD COLUMN` would fix those four statements and break again on
 * the next `DROP COLUMN` / `RENAME COLUMN` / `ALTER COLUMN TYPE`. Postgres is
 * the only thing that reads this SQL the way `prisma migrate deploy` and
 * `drizzle-kit migrate` do, so each combo's migrations are replayed into a
 * throwaway database and the result is introspected. The migration files are
 * still the only input — they're just executed by the real engine.
 */

const TIMEOUT_MS = 120_000;

type Ran = { stdout: string; stderr: string };

/**
 * `docker compose` with an argument array and no shell — the same rule the
 * service controls follow. Migration SQL is written to stdin rather than passed
 * as an argument, so nothing inside a file can ever be read as a flag.
 */
function compose(args: string[], input?: string): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", ...args], {
      cwd: REPO_ROOT,
      timeout: TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    // psql can exit before the whole file is written (it stops on the first
    // error); the resulting EPIPE is not the failure we want to report.
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const why = signal ? `killed by ${signal}` : `exited with ${code}`;
      reject(new Error(stderr.trim() || stdout.trim() || `docker compose ${why}`));
    });

    child.stdin.end(input ?? "");
  });
}

/**
 * `ON_ERROR_STOP=1` is the load-bearing flag. Without it psql keeps going after
 * a failed statement and still exits 0, leaving a half-applied schema that would
 * be introspected and reported as the truth.
 */
function psql(database: string, args: string[], input?: string): Promise<Ran> {
  return compose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "--no-psqlrc",
      "-q",
      ...args,
    ],
    input,
  );
}

function firstLine(error: unknown): string {
  const text = (error as Error).message ?? String(error);
  return text.split("\n").find((line) => line.trim()) ?? "unknown error";
}

/**
 * The scratch database a combo is replayed into. Obviously disposable, and
 * deliberately nothing like the `example_*` databases the running backends use —
 * those are real dev data and are never touched here. The name is derived from
 * the fixed COMBOS list, never from request text, and only ever yields [a-z_].
 */
function scratchDatabase(combo: ComboName): string {
  return `devportal_replay_scratch_${combo.replaceAll("-", "_")}`;
}

export type PostgresStatus = { up: true } | { up: false; reason: string };

/** Can we reach the compose Postgres at all? Asked before any replay starts. */
export async function postgresStatus(): Promise<PostgresStatus> {
  try {
    await psql("postgres", ["-t", "-A", "-c", "SELECT 1"]);
    return { up: true };
  } catch (error) {
    return { up: false, reason: firstLine(error) };
  }
}

/**
 * Columns come from `information_schema`; keys come from `pg_catalog`, where a
 * multi-column constraint is a pair of ordered arrays rather than the cross
 * product `information_schema.constraint_column_usage` would hand back.
 */
const INTROSPECT = `
SELECT json_build_object(
  'columns', (
    SELECT coalesce(json_agg(json_build_object(
      'table', c.table_name,
      'name', c.column_name,
      'dataType', c.data_type,
      'udtName', c.udt_name,
      'notNull', c.is_nullable = 'NO',
      'charMax', c.character_maximum_length,
      'datetimePrecision', c.datetime_precision,
      'numericPrecision', c.numeric_precision,
      'numericScale', c.numeric_scale
    ) ORDER BY c.table_name, c.ordinal_position), '[]'::json)
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
  ),
  'primaryKeys', (
    SELECT coalesce(json_agg(json_build_object('table', rel.relname, 'column', att.attname)
      ORDER BY rel.relname, k.ord), '[]'::json)
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = con.connamespace AND ns.nspname = 'public'
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
    WHERE con.contype = 'p'
  ),
  'foreignKeys', (
    SELECT coalesce(json_agg(json_build_object(
      'table', src.relname, 'column', srcatt.attname,
      'refTable', tgt.relname, 'refColumn', tgtatt.attname)
      ORDER BY src.relname, srcatt.attname), '[]'::json)
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = con.connamespace AND ns.nspname = 'public'
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(src_attnum, tgt_attnum, ord)
    JOIN pg_attribute srcatt ON srcatt.attrelid = con.conrelid AND srcatt.attnum = k.src_attnum
    JOIN pg_attribute tgtatt ON tgtatt.attrelid = con.confrelid AND tgtatt.attnum = k.tgt_attnum
    WHERE con.contype = 'f'
  )
);
`;

type RawColumn = {
  table: string;
  name: string;
  dataType: string;
  udtName: string;
  notNull: boolean;
  charMax: number | null;
  datetimePrecision: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
};

type Introspection = {
  columns: RawColumn[];
  primaryKeys: { table: string; column: string }[];
  foreignKeys: { table: string; column: string; refTable: string; refColumn: string }[];
};

/**
 * Postgres spells some types out in full ("timestamp without time zone"), which
 * is far too long to sit beside a column name in a diagram or a drift table.
 * These are the short forms you'd actually write in a schema file.
 */
export const TYPE_ALIASES: Record<string, string> = {
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamptz",
  "time without time zone": "time",
  "time with time zone": "timetz",
  "character varying": "varchar",
  character: "char",
  "double precision": "float8",
  integer: "int",
  bigint: "int8",
  smallint: "int2",
  boolean: "bool",
};

/**
 * A short, comparable type name. Modifiers that change the stored value are
 * kept — `timestamp(3)` and `timestamp` are genuinely different columns, and
 * hiding that would be the same class of mistake as dropping ADD COLUMN.
 */
function typeName(column: RawColumn): string {
  // information_schema flattens every array to "ARRAY"; udt_name carries the
  // element type as `_text`, `_int4`, and so on.
  if (column.dataType === "ARRAY") return `${column.udtName.replace(/^_/, "")}[]`;

  const short = TYPE_ALIASES[column.dataType] ?? column.dataType;
  if (column.charMax !== null) return `${short}(${column.charMax})`;
  if (column.dataType.startsWith("timestamp") || column.dataType.startsWith("time")) {
    // 6 is the Postgres default, so it is the plain spelling.
    return column.datetimePrecision === null || column.datetimePrecision === 6
      ? short
      : `${short}(${column.datetimePrecision})`;
  }
  if (column.dataType === "numeric" && column.numericPrecision !== null) {
    return `${short}(${column.numericPrecision},${column.numericScale ?? 0})`;
  }
  return short;
}

export type ComboSchema = {
  dbml: string;
  tables: { name: string; fields: { name: string; type: string; notNull: boolean }[] }[];
  refs: { from: { table: string; column: string }; to: { table: string; column: string } }[];
  primaryKeys: Set<string>;
  warnings: string[];
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The introspected schema written back out as canonical DDL.
 *
 * This is what gets handed to `@dbml/core` — and it is exactly the subset that
 * importer handles correctly, `CREATE TABLE` plus `ADD CONSTRAINT`, because it
 * is generated from the already-replayed model rather than from the migrations.
 * The diagram therefore shows the same columns the drift table compares.
 */
function canonicalDdl(model: Introspection, ordered: ComboSchema["tables"]): string {
  const pk = new Map<string, string[]>();
  for (const key of model.primaryKeys) {
    if (!pk.has(key.table)) pk.set(key.table, []);
    pk.get(key.table)!.push(key.column);
  }

  const statements = ordered.map((table) => {
    const lines = table.fields.map(
      (field) => `  ${quote(field.name)} ${field.type}${field.notNull ? " NOT NULL" : ""}`,
    );
    const keys = pk.get(table.name);
    if (keys?.length) {
      lines.push(
        `  CONSTRAINT ${quote(`${table.name}_pkey`)} PRIMARY KEY (${keys.map(quote).join(", ")})`,
      );
    }
    return `CREATE TABLE ${quote(table.name)} (\n${lines.join(",\n")}\n);`;
  });

  model.foreignKeys.forEach((fk, index) => {
    statements.push(
      `ALTER TABLE ${quote(fk.table)} ADD CONSTRAINT ${quote(`${fk.table}_${fk.column}_fkey_${index}`)} ` +
        `FOREIGN KEY (${quote(fk.column)}) REFERENCES ${quote(fk.refTable)}(${quote(fk.refColumn)});`,
    );
  });

  return statements.join("\n");
}

/**
 * @dbml/core 9.x emits the newer optional-cardinality relationship operators —
 * `<?` / `>?` when only the referencing side is nullable, and `?<?` / `?>?` when
 * a *self-referencing* nullable column (e.g. `sessions.created_by -> users.id`)
 * makes both sides optional — which both @softwaretechnik/dbml-renderer@1.0.31
 * and @dbml/core's own Parser reject with a parse error on the first `Ref` line
 * that uses one. Rewriting them to the classic `<` / `>` / `<>` loses only the
 * "optional" nuance of the cardinality, on whichever side(s) carried it.
 *
 * This is load-bearing, not tidying: remove it and every diagram with a nullable
 * FK fails to parse — plain `<?`/`>?` (no self-referencing FKs) happened to be
 * the only case this repo's schemas exercised until CASL's join tables and the
 * self-referencing `sessions.*_by` columns added the `?<?` case.
 */
function normalizeRelationshipOperators(dbml: string): string {
  return dbml.replace(/ \??(<>|<|>)\?? /g, " $1 ");
}

/** Introspection result -> the model the drift table and the diagram share. */
function buildSchema(model: Introspection, warnings: string[]): ComboSchema {
  const byTable = new Map<string, ComboSchema["tables"][number]>();
  for (const column of model.columns) {
    if (!byTable.has(column.table)) byTable.set(column.table, { name: column.table, fields: [] });
    byTable.get(column.table)!.fields.push({
      name: column.name,
      type: typeName(column),
      notNull: column.notNull,
    });
  }
  const tables = [...byTable.values()];

  return {
    dbml: normalizeRelationshipOperators(
      importer.import(canonicalDdl(model, tables), "postgres"),
    ),
    tables,
    refs: model.foreignKeys.map((fk) => ({
      from: { table: fk.table, column: fk.column },
      to: { table: fk.refTable, column: fk.refColumn },
    })),
    primaryKeys: new Set(model.primaryKeys.map((key) => `${key.table}.${key.column}`)),
    warnings,
  };
}

/**
 * One scratch database per combo means the four can replay concurrently, but the
 * same combo must never overlap with itself — two runs would fight over the same
 * database name. Requests for a combo already in flight queue behind it.
 */
const locks = new Map<ComboName, Promise<unknown>>();

function withLock<T>(combo: ComboName, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(combo) ?? Promise.resolve();
  const next = previous.then(work, work);
  locks.set(
    combo,
    next.catch(() => {}),
  );
  return next;
}

async function apply(database: string, files: MigrationFile[]): Promise<void> {
  for (const file of files) {
    try {
      await psql(database, ["-f", "-"], file.sql);
    } catch (error) {
      throw new Error(`${file.label} failed to apply — ${firstLine(error)}`);
    }
  }
}

/**
 * Replay one combo's migrations into a scratch database, introspect what they
 * built, and drop it again. The drop runs whether or not the replay succeeded —
 * a broken migration must not leave a database behind.
 */
export function replayCombo(combo: ComboName, set: MigrationSet): Promise<ComboSchema> {
  return withLock(combo, async () => {
    const database = scratchDatabase(combo);
    const drop = () => psql("postgres", ["-c", `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`]);

    await drop();
    await psql("postgres", ["-c", `CREATE DATABASE "${database}"`]);

    let model: Introspection | null = null;
    let failure: unknown = null;
    try {
      await apply(database, set.files);
      const { stdout } = await psql(database, ["-t", "-A", "-f", "-"], INTROSPECT);
      model = JSON.parse(stdout.trim()) as Introspection;
    } catch (error) {
      failure = error;
    }

    const leaked = await drop().then(
      () => null,
      (error: unknown) => firstLine(error),
    );

    if (failure) throw failure;
    const warnings = [...set.warnings];
    if (leaked) {
      warnings.push(`Scratch database ${database} could not be dropped — ${leaked}`);
    }
    return buildSchema(model!, warnings);
  });
}
