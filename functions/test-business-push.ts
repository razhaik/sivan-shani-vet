import { createSuperdevClient } from "npm:@superdevhq/client@0.1.56";

const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_ENDPOINT = "https://api.onesignal.com/notifications";
const MAX_BODY_LENGTH = 2048;
const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ONESIGNAL_ISSUE_KEYS = new Set([
  "invalid_aliases",
  "invalid_player_ids",
  "invalid_external_user_ids",
  "invalid_subscription_ids",
  "invalid_onesignal_ids",
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unwrapIdentity(value: unknown): Record<string, unknown> | null {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!isRecord(current)) return null;
    if (Object.prototype.hasOwnProperty.call(current, "data")) { current = current.data; continue; }
    if (Object.prototype.hasOwnProperty.call(current, "body")) { current = current.body; continue; }
    return current;
  }
  return null;
}

async function authorizeClinicStaff(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authorization = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match?.[1]) return { ok: false, status: 401, error: "Authentication required." };

  const appId = Deno.env.get("SUPERDEV_APP_ID");
  if (!appId) return { ok: false, status: 503, error: "Push testing is unavailable." };

  const client = createSuperdevClient({ appId });
  client.auth.setToken(match[1].trim());

  let user: Record<string, unknown> | null = null;
  try {
    user = unwrapIdentity(await client.auth.me());
  } catch {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (!user) return { ok: false, status: 401, error: "Authentication required." };

  const role = typeof user.role === "string" ? user.role.trim().toLowerCase() : "";
  if (!["administrator", "user"].includes(role)) {
    return { ok: false, status: 403, error: "Clinic staff access is required." };
  }

  return { ok: true };
}

function hasOneSignalIssues(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function oneSignalIssueCategories(...values: unknown[]): string[] {
  const categories: string[] = [];
  for (const value of values) {
    if (!hasOneSignalIssues(value)) continue;
    if (Array.isArray(value)) {
      categories.push("provider_messages");
      continue;
    }
    if (isRecord(value)) {
      const keys = Object.keys(value);
      if (keys.length === 0) continue;
      for (const key of keys.slice(0, 4)) {
        categories.push(SAFE_ONESIGNAL_ISSUE_KEYS.has(key) ? key : "provider_details_redacted");
      }
      continue;
    }
    categories.push("provider_details_redacted");
  }
  return [...new Set(categories)].slice(0, 4);
}

function recipientCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function logOutcome({
  httpStatus,
  outcome,
  notificationId,
  recipients,
  issueCategories,
}: {
  httpStatus: number | null;
  outcome: string;
  notificationId: string | null;
  recipients?: number;
  issueCategories?: string[];
}) {
  console.info("[ClinicPushTest] OneSignal response", {
    event: "manual_test",
    http_status: httpStatus,
    outcome,
    notification_id: notificationId,
    ...(recipients !== undefined ? { recipient_count: recipients } : {}),
    ...(issueCategories?.length ? { issue_categories: issueCategories.slice(0, 4) } : {}),
  });
}

function providerRejectionMessage(status: number): string {
  if (status === 401 || status === 403) return "OneSignal rejected the server credentials.";
  if (status === 429) return "OneSignal rate-limited the request.";
  if (status >= 500) return "OneSignal is temporarily unavailable.";
  return `OneSignal rejected the request (HTTP ${status}).`;
}

async function handleRequest(req: Request) {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (new URL(req.url).search) return json({ error: "Query parameters are not accepted." }, 400);

  const authorization = await authorizeClinicStaff(req);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const contentLength = Number(req.headers.get("Content-Length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_LENGTH) {
    return json({ error: "Request body is too large." }, 413);
  }

  let requestBody: unknown;
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_LENGTH) return json({ error: "Request body is too large." }, 413);
    requestBody = JSON.parse(rawBody);
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!isRecord(requestBody)) return json({ error: "Request body is invalid." }, 400);
  if (Object.keys(requestBody).length !== 1 || !Object.prototype.hasOwnProperty.call(requestBody, "subscription_id")) {
    return json({ error: "Only subscription_id is accepted." }, 400);
  }

  const subscriptionId = requestBody.subscription_id;
  if (typeof subscriptionId !== "string" || !SUBSCRIPTION_ID_PATTERN.test(subscriptionId)) {
    return json({ error: "A valid OneSignal subscription ID is required." }, 400);
  }

  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!apiKey) return json({ error: "Push testing is unavailable." }, 503);

  let response: Response;
  try {
    response = await fetch(ONESIGNAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        include_subscription_ids: [subscriptionId],
        headings: { en: "Clinic notification test", he: "בדיקת התראה" },
        contents: { en: "This is a test notification for this device.", he: "זוהי התראת בדיקה למכשיר הזה." },
      }),
    });
  } catch {
    logOutcome({ httpStatus: null, outcome: "request_failed", notificationId: null, issueCategories: ["network_error"] });
    return json({ ok: false, status: "unavailable", warning: "OneSignal could not be reached." });
  }

  let rawResponse: unknown = null;
  let malformed = false;
  try { rawResponse = await response.json(); } catch { malformed = true; }
  const payload = isRecord(rawResponse) ? rawResponse : null;
  const recipients = recipientCount(payload?.recipients);
  const issueCategories = oneSignalIssueCategories(payload?.errors, payload?.warnings);

  if (!response.ok) {
    const safeCategories = issueCategories.length ? issueCategories : ["provider_rejected"];
    logOutcome({ httpStatus: response.status, outcome: "rejected", notificationId: null, recipients, issueCategories: safeCategories });
    return json({
      ok: false,
      status: "rejected",
      http_status: response.status,
      warning: providerRejectionMessage(response.status),
      ...(recipients !== undefined ? { recipient_count: recipients } : {}),
      issue_categories: safeCategories,
    });
  }

  if (!payload || malformed) {
    logOutcome({ httpStatus: response.status, outcome: "invalid_response", notificationId: null, issueCategories: ["malformed_response"] });
    return json({
      ok: false,
      status: "invalid_response",
      http_status: response.status,
      warning: "OneSignal returned an unreadable response.",
    });
  }

  const notificationId = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!notificationId || notificationId.length > 128) {
    const safeCategories = issueCategories.length ? issueCategories : ["no_notification_id"];
    logOutcome({ httpStatus: response.status, outcome: "no_target", notificationId: null, recipients, issueCategories: safeCategories });
    return json({
      ok: false,
      status: "no_target",
      http_status: response.status,
      warning: "OneSignal returned a successful response without a notification ID. No notification was created for this subscription.",
      ...(recipients !== undefined ? { recipient_count: recipients } : {}),
      issue_categories: safeCategories,
    });
  }

  const warning = issueCategories.length
    ? "OneSignal created the notification and reported partial recipient warnings."
    : undefined;
  logOutcome({
    httpStatus: response.status,
    outcome: warning ? "created_with_warning" : "created",
    notificationId,
    recipients,
    issueCategories,
  });
  return json({
    ok: true,
    status: warning ? "created_with_warning" : "created",
    notification_id: notificationId,
    ...(recipients !== undefined ? { recipient_count: recipients } : {}),
    ...(warning ? { warning, issue_categories: issueCategories } : {}),
  });
}

Deno.serve(handleRequest);
