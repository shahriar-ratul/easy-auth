/** Where this panel is served from. Referenced by the README — don't change it. */
export const HOST = "127.0.0.1";
export const PORT = 8080;

const ALLOWED_ORIGINS = [`http://${HOST}:${PORT}`, `http://localhost:${PORT}`];

/** POST bodies are two short strings; anything larger is not a real request. */
export const MAX_BODY_BYTES = 4096;

/**
 * Any website you visit can POST to localhost. Requiring a same-origin `Origin`
 * keeps a random page from restarting your stack in the background.
 *
 * A missing Origin is allowed: curl and same-origin GETs send none, while every
 * cross-site fetch from a browser sends one.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

export class BodyTooLarge extends Error {
  constructor() {
    super(`Request body must be under ${MAX_BODY_BYTES} bytes.`);
  }
}

/**
 * Read the body with a hard cap, checked as bytes arrive rather than only from
 * `content-length` — a chunked request can lie about its length or omit it.
 */
export async function readCappedBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLarge();

  const body = request.body;
  if (!body) return "";

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
