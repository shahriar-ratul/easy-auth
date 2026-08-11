import { schemaReport } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/schema -> the auth schema each combo's migration files actually
 * produce, with the columns the four disagree on.
 *
 * The migrations are replayed into a throwaway Postgres database and the result
 * introspected, so `ALTER TABLE` counts exactly as much as `CREATE TABLE`. That
 * needs Postgres up: when it isn't, the answer says so (`unavailable`) rather
 * than falling back to something less true.
 *
 * `?refresh=1` forces a fresh replay instead of reusing the cached one.
 */
export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    return Response.json(await schemaReport({ refresh }), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
