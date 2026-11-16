// Answers browser preflight requests and adds CORS headers to every response.
// Buildy's gateway did this for us; Supabase leaves it to each function.
// Import this module first in a function's index.ts: it wraps Deno.serve.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-superdev-internal-key",
  "Access-Control-Max-Age": "86400",
};

type Handler = (req: Request, info?: unknown) => Response | Promise<Response>;

function withCors(handler: Handler): Handler {
  return async (req, info) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    const res = await handler(req, info);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

const originalServe = Deno.serve.bind(Deno) as (...args: unknown[]) => unknown;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (...args: unknown[]) => {
  const i = args.findIndex((a) => typeof a === "function");
  if (i >= 0) args[i] = withCors(args[i] as Handler);
  else if (args[0] && typeof (args[0] as { handler?: unknown }).handler === "function") {
    const opts = args[0] as { handler: Handler };
    args[0] = { ...opts, handler: withCors(opts.handler) };
  }
  return originalServe(...args);
};
