import { BodyTooLarge, readCappedBody, sameOrigin } from "@/lib/guards";
import { isAction, isServiceTarget, runAction, status } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (code: number, error: string) =>
  Response.json({ error }, { status: code, headers: { "cache-control": "no-store" } });

/**
 * POST /api/action  {"service":"postgres","action":"start"}
 *
 * Runs `docker compose <verb> [service]` and answers with the fresh status, so
 * one round trip both acts and re-reads.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused.");

  let raw: string;
  try {
    raw = await readCappedBody(request);
  } catch (error) {
    if (error instanceof BodyTooLarge) return fail(413, error.message);
    return fail(400, "Could not read the request body.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(400, "Body must be JSON.");
  }

  const { service, action } = (parsed ?? {}) as { service?: unknown; action?: unknown };
  if (!isAction(action)) return fail(400, `Unknown action: ${String(action)}`);
  if (!isServiceTarget(service)) return fail(400, `Unknown service: ${String(service)}`);

  const result = await runAction(action, service);
  if (!result.ok) return fail(500, result.error);

  return Response.json(await status(), { headers: { "cache-control": "no-store" } });
}
