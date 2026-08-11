import { status } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/status -> container state + port reachability for every service. */
export async function GET() {
  return Response.json(await status(), {
    headers: { "cache-control": "no-store" },
  });
}
