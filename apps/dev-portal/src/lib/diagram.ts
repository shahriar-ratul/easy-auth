import { run as renderDbml } from "@softwaretechnik/dbml-renderer";

import { compare, driftKeys, loadSchemas } from "./schema";
import type { ComboName } from "./types";

/**
 * dbml-renderer emits graphviz's own palette. These are the exact colours it
 * uses, remapped onto the panel's — the diagram has to sit on the same chassis
 * as everything else on the page.
 */
const RENDERER = {
  header: "#1d71b8",
  headerText: "#ffffff",
  row: "#e7e2dd",
  ink: "#29235c",
} as const;

const PANEL = {
  ink: "#16171A",
  face: "#F5F5F3",
  rule: "#C7C8C3",
  inkMuted: "#6E7176",
  signal: "#FF4A17",
  signalWash: "#FBE0D6",
} as const;

/** The literal that starts a field row's background rectangle. */
const ROW_START = `<polygon fill="${RENDERER.row}"`;

function paintNode(inner: string, driftingFields: Set<number>): string {
  // Rows appear in field order, so the nth row rectangle is the nth field.
  const segments = inner.split(ROW_START);
  const rebuilt = segments
    .map((segment, index) => {
      if (index === 0) return segment; // the header, before any row
      if (!driftingFields.has(index - 1)) return ROW_START + segment;
      return (
        `<polygon fill="${PANEL.signalWash}"` +
        segment.replaceAll(`fill="${RENDERER.ink}"`, `fill="${PANEL.signal}"`)
      );
    })
    .join("");

  return rebuilt
    .replaceAll(`fill="${RENDERER.header}"`, `fill="${PANEL.ink}"`)
    .replaceAll(`fill="${RENDERER.headerText}"`, `fill="${PANEL.face}"`)
    .replaceAll(`fill="${RENDERER.row}"`, `fill="${PANEL.face}"`)
    .replaceAll(`stroke="${RENDERER.ink}"`, `stroke="${PANEL.rule}"`)
    .replaceAll(`fill="${RENDERER.ink}"`, `fill="${PANEL.ink}"`);
}

function paintEdge(inner: string): string {
  return inner
    .replaceAll(`stroke="${RENDERER.ink}"`, `stroke="${PANEL.inkMuted}"`)
    .replaceAll(`fill="${RENDERER.ink}"`, `fill="${PANEL.inkMuted}"`);
}

/**
 * Recolour the rendered SVG and mark the drifting rows in it.
 *
 * graphviz did the layout — real edge routing, which is the whole reason this
 * is a rendered diagram rather than a hand-placed one — so the only thing left
 * to do is restyle the output and highlight the columns the combos disagree on.
 */
function restyle(
  svg: string,
  drifting: Map<string, Set<number>>,
  label: string,
): string {
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!DOCTYPE[\s\S]*?>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  const painted = body
    .replace(
      /<g id="([^"]+)" class="node">([\s\S]*?)<\/g>/g,
      (_all, table: string, inner: string) =>
        `<g id="${table}" class="node">${paintNode(inner, drifting.get(table) ?? new Set())}</g>`,
    )
    .replace(
      /<g id="edge\d+" class="edge">([\s\S]*?)<\/g>/g,
      (_all, inner: string) => `<g class="edge">${paintEdge(inner)}</g>`,
    );

  // Drop graphviz's fixed pt dimensions so the diagram scales to its container;
  // the viewBox it keeps is what preserves the aspect ratio.
  return painted.replace(
    /<svg width="[^"]*" height="[^"]*"/,
    `<svg role="img" aria-label="${label}" style="width:100%;height:auto;display:block"`,
  );
}

/** One combo's ER diagram as an SVG string, styled for this panel. */
export async function comboDiagram(combo: ComboName): Promise<string> {
  // Both the drawing and the highlighting come out of the same replay, so the
  // diagram can never disagree with the drift table underneath it.
  const loaded = await loadSchemas();
  if (loaded.unavailable) throw new Error(`Postgres isn't running — ${loaded.unavailable}`);

  const schema = loaded.schemas[combo];
  if (!schema) throw new Error(loaded.errors[combo] ?? `${combo} could not be replayed.`);

  const keys = driftKeys(compare(loaded));

  const drifting = new Map<string, Set<number>>();
  for (const table of schema.tables) {
    const indexes = new Set<number>();
    table.fields.forEach((field, index) => {
      if (keys.has(`${table.name}.${field.name}`)) indexes.add(index);
    });
    if (indexes.size) drifting.set(table.name, indexes);
  }

  const label =
    `Entity relationship diagram of the ${combo} auth schema: ` +
    `${schema.tables.length} tables, ${schema.refs.length} relationships. ` +
    `Columns highlighted in orange differ between the four combos.`;

  return restyle(renderDbml(schema.dbml, "svg"), drifting, label);
}
