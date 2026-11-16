import "../_shared/cors.ts";
// Sends an e-mail on behalf of a signed-in clinic admin (replaces Buildy's core.sendEmail).
import { createSuperdevClient, sendEmailViaResend } from "../_shared/superdev-compat.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const client = createSuperdevClient();
    client.auth.setToken(token);
    if (!(await client.auth.me())) return json({ error: "Unauthorized" }, 401);
    const params = await req.json();
    return json(await sendEmailViaResend(params));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
