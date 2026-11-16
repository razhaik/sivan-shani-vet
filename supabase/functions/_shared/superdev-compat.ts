/**
 * Drop-in replacement for `createSuperdevClient` inside Supabase Edge Functions.
 * Data goes to this project's Postgres; e-mail goes out through Resend.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeEntities } from "./compat-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EMAIL_FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") || "noreply@sivanshanivet.com";
const EMAIL_DEFAULT_NAME = Deno.env.get("EMAIL_FROM_NAME") || 'ד"ר סיון שני';

const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export async function sendEmailViaResend(params: Record<string, any>) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const to = Array.isArray(params.to) ? params.to : String(params.to || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new Error("Missing recipient");
  const fromName = String(params.from_name || EMAIL_DEFAULT_NAME).replace(/[<>"]/g, "");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${EMAIL_FROM_ADDRESS}>`,
      to,
      subject: String(params.subject || ""),
      html: String(params.body_html || params.html || params.body || ""),
      ...(params.reply_to ? { reply_to: params.reply_to } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Email failed: ${body?.message || res.status}`);
  return { success: true, id: body?.id };
}

export function createSuperdevClient(_options: Record<string, unknown> = {}) {
  let token: string | null = null;
  let userClient: any = null;

  const db = () => (!token || token === SERVICE_ROLE_KEY || !userClient ? serviceClient : userClient);

  const { entity, entities } = makeEntities({ db, currentUserEmail: async () => (token && token !== SERVICE_ROLE_KEY ? (await me())?.email ?? null : "system") });

  async function me() {
    if (!token) return null;
    if (token === SERVICE_ROLE_KEY) return { id: "service", email: "system", role: "service" };
    const { data, error } = await serviceClient.auth.getUser(token);
    if (error || !data?.user) return null;
    const email = data.user.email || "";
    const { data: admin } = await serviceClient.from("app_admin").select("email").ilike("email", email).maybeSingle();
    if (!admin) return null; // only clinic admins count as signed-in users of this app
    return { id: data.user.id, email, full_name: data.user.user_metadata?.full_name || email, role: "admin" };
  }

  const auth = {
    setToken(t: string) {
      token = t;
      userClient = t && t !== SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${t}` } }, auth: { persistSession: false } })
        : null;
    },
    getToken: () => token,
    clearToken() { token = null; userClient = null; },
    me,
    getUser: me,
    async isAuthenticated() { return Boolean(await me()); },
  };

  const functions = new Proxy({}, {
    get: (_t, name) => (typeof name === "string" && name !== "then" && !name.startsWith("_")
      ? async (params?: Record<string, unknown>, options: { headers?: Record<string, string>; signal?: AbortSignal } = {}) => {
          // Server-to-server call: mark it as internal so protected functions (SMS, notifications) accept it.
          const headers: Record<string, string> = { "Content-Type": "application/json", apikey: ANON_KEY, ...(options.headers || {}), "X-Superdev-Internal-Key": SERVICE_ROLE_KEY };
          if (!headers.Authorization) headers.Authorization = `Bearer ${ANON_KEY}`;
          const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers, body: JSON.stringify(params || {}), signal: options.signal });
          const text = await res.text();
          let body: any = text; try { body = JSON.parse(text); } catch { /* keep text */ }
          if (!res.ok) throw new Error(`API request failed: ${body?.error || body?.message || res.status}`);
          return body;
        }
      : undefined),
  });

  const unavailable = (feature: string) => async () => { throw new Error(`${feature} is not available`); };
  const integrations = {
    core: {
      sendEmail: (params: Record<string, any>) => sendEmailViaResend(params),
      contacts: async () => ({ success: true }),
      invokeLLM: unavailable("invokeLLM"),
      textAgentChat: unavailable("textAgentChat"),
      generateImage: unavailable("generateImage"),
    },
  };

  return { auth, entity, entities, functions, integrations };
}

/** True for calls from this project's own functions (internal key) or from a signed-in clinic admin. */
export async function isInternalOrAdmin(req: Request): Promise<boolean> {
  if (req.headers.get("X-Superdev-Internal-Key") === SERVICE_ROLE_KEY) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const client = createSuperdevClient();
  client.auth.setToken(token);
  return Boolean(await client.auth.me());
}
