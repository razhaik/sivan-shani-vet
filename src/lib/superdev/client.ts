/**
 * Browser client. Same shape as the old Buildy `superdevClient`, backed by Supabase.
 * See compat-core.ts for the data layer.
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { makeEntities } from "./compat-core";

/* eslint-disable @typescript-eslint/no-explicit-any */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Invitation / password-reset links land on the site root: send them to /login to choose a password.
if (typeof window !== "undefined" && /type=(invite|recovery)/.test(window.location.hash) && window.location.pathname !== "/login") {
  window.location.replace(`/login${window.location.hash}`);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const LOGIN_PATH = "/login";

async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

const { entity, entities } = makeEntities({
  db: () => supabase,
  currentUserEmail: async () => (await currentSession())?.user?.email ?? null,
  isAnonymous: async () => !(await currentSession()),
  // Visitors on the public booking page only see free/busy slots, never client details.
  publicViews: { Appointment: "appointment_public" },
});

function userRecord(session: Session | null) {
  const u = session?.user;
  if (!u) return null;
  const meta = (u.user_metadata || {}) as Record<string, any>;
  return { id: u.id, email: u.email, full_name: meta.full_name || u.email, profile_image_url: meta.profile_image_url || "", role: "admin", ...meta };
}

const auth = {
  client: { options: { requiresAuth: false, loginUrl: `${LOGIN_PATH}?` } },
  getToken: () => null,
  setToken: () => undefined,
  clearToken: () => supabase.auth.signOut(),
  login() {
    const from = window.location.pathname + window.location.search;
    window.location.href = `${LOGIN_PATH}?from_url=${encodeURIComponent(from)}`;
  },
  async isAuthenticated() { return Boolean(await currentSession()); },
  async getUser() { return userRecord(await currentSession()); },
  async me() { return userRecord(await currentSession()); },
  async list() { return { data: [] }; },
  async updateProfile(data: Record<string, unknown>) {
    const { data: res, error } = await supabase.auth.updateUser({ data });
    if (error) throw error;
    return userRecord({ user: res.user } as Session);
  },
  async logout(redirectToLogin = true) {
    await supabase.auth.signOut();
    if (redirectToLogin) window.location.href = "/";
  },
};

async function invokeFunction(name: string, params?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body: params || {} });
  if (error) {
    let detail = error.message;
    try { const body = await (error as any).context?.json?.(); detail = body?.error || body?.message || detail; } catch { /* ignore */ }
    throw new Error(`API request failed: ${detail}`);
  }
  return data;
}

const functions = new Proxy({}, {
  get: (_t, name) => (typeof name === "string" && name !== "then" && !name.startsWith("_")
    ? (params?: Record<string, unknown>) => invokeFunction(name, params)
    : undefined),
}) as Record<string, (params?: Record<string, unknown>) => Promise<any>>;

const unavailable = (feature: string) => async () => {
  throw new Error(`${feature} אינו זמין כרגע במערכת.`);
};

const core = {
  sendEmail: (params: Record<string, unknown>) => invokeFunction("send-email", params),
  async uploadFile({ file }: { file: File }) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from("uploads").getPublicUrl(path);
    return { file_url: data.publicUrl };
  },
  getUploadedFile: async ({ file_url }: { file_url: string }) => ({ file_url }),
  // The old platform kept a separate contacts list; clients already live in business_client.
  contacts: async () => ({ success: true }),
  invokeLLM: unavailable("עוזר ה-AI"),
  textAgentChat: unavailable("עוזר ה-AI"),
  generateImage: unavailable("יצירת תמונות"),
  extractDataFromUploadedFile: unavailable("חילוץ נתונים מקובץ"),
};

export const superdevClient = {
  options: { affiliateId: "dr-sivan-shani", showBranding: false },
  auth,
  entity,
  entities,
  functions,
  integrations: { core },
  isAuthenticated: auth.isAuthenticated,
} as any;
