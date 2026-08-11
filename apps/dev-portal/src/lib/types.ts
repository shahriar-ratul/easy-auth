/** Shapes shared by the route handlers and the client components. */

export const COMBOS = [
  "nestjs-prisma",
  "nestjs-drizzle",
  "express-prisma",
  "express-drizzle",
] as const;

export type ComboName = (typeof COMBOS)[number];

/** The combo the other three are meant to mirror. */
export const REFERENCE_COMBO: ComboName = "nestjs-prisma";

export function isCombo(value: unknown): value is ComboName {
  return typeof value === "string" && (COMBOS as readonly string[]).includes(value);
}

export type Column = {
  name: string;
  /** The type the combos agree on, or the majority one when they don't. */
  type: string | null;
  pk: boolean;
  fk: { table: string; column: string } | null;
  drifts: boolean;
};

export type Table = {
  name: string;
  columns: Column[];
};

export type DriftRow = {
  table: string;
  column: string;
  /** Per-combo type signature; null means the column isn't in that combo at all. */
  variants: Record<ComboName, string | null>;
};

export type SchemaReport = {
  combos: ComboName[];
  reference: ComboName;
  /** Per-combo replay result, so a single broken combo is visible rather than fatal. */
  parsed: Record<ComboName, { tables: number; refs: number; error: string | null }>;
  tables: Table[];
  drift: DriftRow[];
  tableCount: number;
  columnCount: number;
  driftCount: number;
  /** Repo defects found while reading the migrations (e.g. orphaned SQL files). */
  warnings: string[];
  /**
   * Why nothing could be compared, when the reason is that Postgres is down.
   * Separate from `error` because it is the one failure the panel can fix
   * itself — the schema is built by replaying migrations, so it needs Postgres.
   */
  unavailable: string | null;
  error: string | null;
};
