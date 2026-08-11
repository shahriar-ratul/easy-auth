import { comboDiagram } from "@/lib/diagram";
import { schemaReport } from "@/lib/schema";
import { REFERENCE_COMBO, isCombo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schema/diagram?combo=nestjs-prisma -> that combo's ER diagram as SVG,
 * laid out by graphviz (bundled as wasm by dbml-renderer — no system graphviz).
 *
 * Drawn from the same replayed schema `/api/schema` compares, so the picture and
 * the drift table always agree. 503 when Postgres is down: there is no diagram
 * to draw, and an out-of-date one would be worse than none.
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("combo") ?? REFERENCE_COMBO;
  // Same rule as the service allowlist: a combo name selects a file path, so it
  // is matched against the known set rather than trusted.
  if (!isCombo(requested)) {
    return Response.json({ error: `Unknown combo: ${requested}` }, { status: 400 });
  }

  try {
    const { unavailable } = await schemaReport();
    if (unavailable) {
      return Response.json(
        { error: `Postgres isn't running, so there is nothing to draw — ${unavailable}` },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return new Response(await comboDiagram(requested), {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
