import { sendBusinessNotification, testBusinessPush } from "@/functions";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const ONESIGNAL_WORKER_PATH = "push/onesignal/OneSignalSDKWorker.js";
const ONESIGNAL_ORIGIN = new URL(VETERINARY_CLINIC_PROFILE.publicOrigin).origin;
const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OneSignalInitOptions = {
  appId: string;
  serviceWorkerPath: string;
  serviceWorkerParam: { scope: string };
  notifyButton: { enable: false };
  promptOptions: {
    slidedown: {
      prompts: Array<{ type: "push"; autoPrompt: false }>;
    };
  };
};

type OneSignalInstance = {
  init: (options: OneSignalInitOptions) => Promise<void>;
  Notifications: {
    isPushSupported: () => boolean;
    permission: boolean;
    requestPermission: () => Promise<void>;
  };
  User: {
    PushSubscription: {
      optedIn: boolean;
      id: string | null;
      optIn: () => Promise<void>;
      addEventListener?: (event: "change", listener: (change: unknown) => void) => void;
      removeEventListener?: (event: "change", listener: (change: unknown) => void) => void;
    };
  };
};

type OneSignalDeferredCallback = (oneSignal: OneSignalInstance) => void | Promise<void>;


declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredCallback[];
  }
}

export type BusinessNotificationEvent = "new_appointment" | "new_inquiry" | "appointment_changed" | "appointment_no_show";
export type BrowserPushEvent = Extract<BusinessNotificationEvent, "new_appointment" | "new_inquiry">;
export type BrowserPushStatus = "loading" | "ready" | "subscribed" | "unsupported" | "denied" | "unconfigured" | "origin-mismatch" | "error";
export type BrowserPushPermission = NotificationPermission | "unsupported";

export type BrowserPushReadinessInput = {
  configured: boolean;
  originMatches: boolean;
  supported: boolean;
  permission: NotificationPermission;
  optedIn: boolean;
};

export type BrowserPushDiagnostics = {
  status: BrowserPushStatus;
  permission: BrowserPushPermission;
  optedIn: boolean;
  oneSignalSupported: boolean;
  subscriptionId: string | null;
  subscriptionIdPresent: boolean;
  subscriptionIdValid: boolean;
  workerRegistered: boolean;
  nativeSubscriptionPresent: boolean;
  canTargetDevice: boolean;
};

export type BrowserPushTestStatus = "created" | "created_with_warning" | "no_target" | "rejected" | "invalid_response" | "unavailable";

export type BrowserPushTestResult = {
  status: BrowserPushTestStatus;
  notificationId?: string;
  recipientCount?: number;
  httpStatus?: number;
  warning?: string;
};

export function resolveBrowserPushStatus(input: BrowserPushReadinessInput): BrowserPushStatus {
  if (!input.configured) return "unconfigured";
  if (!input.originMatches) return "origin-mismatch";
  if (!input.supported) return "unsupported";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted" && input.optedIn) return "subscribed";
  return "ready";
}

const initOptions: OneSignalInitOptions = {
  appId: ONESIGNAL_APP_ID,
  serviceWorkerPath: ONESIGNAL_WORKER_PATH,
  serviceWorkerParam: { scope: "/push/onesignal/" },
  notifyButton: { enable: false },
  promptOptions: {
    slidedown: {
      prompts: [{ type: "push", autoPrompt: false }],
    },
  },
};

let oneSignalPromise: Promise<OneSignalInstance> | null = null;
let legacyOneSignalCleanupPromise: Promise<void> | null = null;

export function cleanupLegacyOneSignalWorker(): Promise<void> {
  if (legacyOneSignalCleanupPromise) return legacyOneSignalCleanupPromise;

  legacyOneSignalCleanupPromise = (async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const rootScope = `${window.location.origin}/`;
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === rootScope)
          .filter((registration) =>
            [registration.active, registration.waiting, registration.installing]
              .some((worker) => worker?.scriptURL.includes("OneSignalSDKWorker.js"))
          )
          .map((registration) => registration.unregister())
      );
    } catch {
      // Cleanup only; a failure here must not stop the app.
    }
  })();

  return legacyOneSignalCleanupPromise;
}

function canUseBrowserPush(): boolean {
  return typeof window !== "undefined"
    && typeof document !== "undefined"
    && typeof navigator !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator;
}

function getBrowserPushPreflightStatus(): BrowserPushStatus | null {
  if (!ONESIGNAL_APP_ID.trim()) return "unconfigured";
  if (typeof window === "undefined" || typeof document === "undefined") return "unsupported";
  if (window.location.origin !== ONESIGNAL_ORIGIN) return "origin-mismatch";
  if (!canUseBrowserPush()) return "unsupported";
  return null;
}

function currentBrowserPermission(): BrowserPushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function emptyDiagnostics(status: BrowserPushStatus): BrowserPushDiagnostics {
  return {
    status,
    permission: currentBrowserPermission(),
    optedIn: false,
    oneSignalSupported: false,
    subscriptionId: null,
    subscriptionIdPresent: false,
    subscriptionIdValid: false,
    workerRegistered: false,
    nativeSubscriptionPresent: false,
    canTargetDevice: false,
  };
}

function removeDeferredCallback(callback: OneSignalDeferredCallback | null) {
  if (!callback || !window.OneSignalDeferred) return;
  const callbackIndex = window.OneSignalDeferred.indexOf(callback);
  if (callbackIndex >= 0) window.OneSignalDeferred.splice(callbackIndex, 1);
}

function loadOneSignal(): Promise<OneSignalInstance> {
  if (!canUseBrowserPush()) {
    return Promise.reject(new Error("Browser push is not supported in this environment."));
  }

  if (oneSignalPromise) return oneSignalPromise;

  let deferredCallback: OneSignalDeferredCallback | null = null;
  let script: HTMLScriptElement | null = null;
  let scriptLoaded = false;
  let scriptErrorListener: (() => void) | null = null;

  oneSignalPromise = cleanupLegacyOneSignalWorker()
    .catch(() => undefined)
    .then(() => new Promise<OneSignalInstance>((resolve, reject) => {
      let settled = false;
      const finishResolve = (instance: OneSignalInstance) => {
        if (settled) return;
        settled = true;
        script?.removeEventListener("error", scriptErrorListener);
        removeDeferredCallback(deferredCallback);
        resolve(instance);
      };
      const finishReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        script?.removeEventListener("error", scriptErrorListener);
        removeDeferredCallback(deferredCallback);
        reject(error instanceof Error ? error : new Error("OneSignal could not be loaded."));
      };

      const deferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred = deferred;
      deferredCallback = async (oneSignal) => {
        scriptLoaded = true;
        try {
          await oneSignal.init(initOptions);
          finishResolve(oneSignal);
        } catch (error) {
          finishReject(error);
        }
      };
      deferred.push(deferredCallback);

      script = document.querySelector<HTMLScriptElement>(`script[src="${ONESIGNAL_SDK_URL}"]`);
      if (script) {
        scriptErrorListener = () => finishReject(new Error("OneSignal script failed to load."));
        script.addEventListener("error", scriptErrorListener, { once: true });
        return;
      }

      script = document.createElement("script");
      script.src = ONESIGNAL_SDK_URL;
      script.async = true;
      script.defer = true;
      script.dataset.onesignalSdk = "true";
      scriptErrorListener = () => finishReject(new Error("OneSignal script failed to load."));
      script.addEventListener("error", scriptErrorListener, { once: true });
      document.head.appendChild(script);
    }))
    .catch((error) => {
      oneSignalPromise = null;
      removeDeferredCallback(deferredCallback);
      if (!scriptLoaded && script?.dataset.onesignalSdk === "true") script.remove();
      throw error;
    });

  return oneSignalPromise;
}

function readBrowserPushStatus(oneSignal: OneSignalInstance): BrowserPushStatus {
  return resolveBrowserPushStatus({
    configured: Boolean(ONESIGNAL_APP_ID.trim()),
    originMatches: window.location.origin === ONESIGNAL_ORIGIN,
    supported: canUseBrowserPush() && oneSignal.Notifications.isPushSupported(),
    permission: window.Notification.permission,
    optedIn: oneSignal.User.PushSubscription.optedIn === true,
  });
}

async function inspectOneSignalWorker(): Promise<{ workerRegistered: boolean; nativeSubscriptionPresent: boolean }> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { workerRegistered: false, nativeSubscriptionPresent: false };
  }

  try {
    const expectedScope = new URL("/push/onesignal/", window.location.origin).href;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const registration = registrations.find((candidate) => candidate.scope === expectedScope);
    if (!registration) return { workerRegistered: false, nativeSubscriptionPresent: false };
    const nativeSubscription = await registration.pushManager.getSubscription();
    return { workerRegistered: true, nativeSubscriptionPresent: Boolean(nativeSubscription) };
  } catch {
    return { workerRegistered: false, nativeSubscriptionPresent: false };
  }
}

export async function getBrowserPushDiagnostics(): Promise<BrowserPushDiagnostics> {
  const preflightStatus = getBrowserPushPreflightStatus();
  if (preflightStatus) return emptyDiagnostics(preflightStatus);

  try {
    const oneSignal = await loadOneSignal();
    const status = readBrowserPushStatus(oneSignal);
    const pushSubscription = oneSignal.User.PushSubscription;
    const rawSubscriptionId = typeof pushSubscription.id === "string" ? pushSubscription.id.trim() : "";
    const subscriptionIdPresent = rawSubscriptionId.length > 0;
    const subscriptionIdValid = SUBSCRIPTION_ID_PATTERN.test(rawSubscriptionId);
    const subscriptionId = subscriptionIdValid ? rawSubscriptionId : null;
    const optedIn = pushSubscription.optedIn === true;
    const permission = window.Notification.permission;
    const oneSignalSupported = oneSignal.Notifications.isPushSupported();
    const worker = await inspectOneSignalWorker();
    const canTargetDevice = status === "subscribed"
      && permission === "granted"
      && optedIn
      && oneSignalSupported
      && subscriptionIdValid
      && worker.workerRegistered
      && worker.nativeSubscriptionPresent;

    return {
      status,
      permission,
      optedIn,
      oneSignalSupported,
      subscriptionId,
      subscriptionIdPresent,
      subscriptionIdValid,
      workerRegistered: worker.workerRegistered,
      nativeSubscriptionPresent: worker.nativeSubscriptionPresent,
      canTargetDevice,
    };
  } catch {
    return emptyDiagnostics("error");
  }
}

export async function getBrowserPushStatus(): Promise<BrowserPushStatus> {
  return (await getBrowserPushDiagnostics()).status;
}

export function observeBrowserPushSubscriptionChanges(
  onChange: (diagnostics: BrowserPushDiagnostics) => void,
): () => void {
  let active = true;
  let instance: OneSignalInstance | null = null;
  const handleChange = () => {
    if (!active) return;
    void getBrowserPushDiagnostics().then((diagnostics) => {
      if (active) onChange(diagnostics);
    }).catch(() => undefined);
  };

  void loadOneSignal().then((oneSignal) => {
    if (!active) return;
    instance = oneSignal;
    oneSignal.User.PushSubscription.addEventListener?.("change", handleChange);
  }).catch(() => undefined);

  return () => {
    active = false;
    instance?.User.PushSubscription.removeEventListener?.("change", handleChange);
  };
}

export async function requestBrowserPushPermission(): Promise<BrowserPushStatus> {
  const preflightStatus = getBrowserPushPreflightStatus();
  if (preflightStatus) return preflightStatus;

  const oneSignal = await loadOneSignal();
  const currentStatus = readBrowserPushStatus(oneSignal);
  if (currentStatus !== "ready") return currentStatus;

  await oneSignal.Notifications.requestPermission();

  if (window.Notification.permission === "granted" && oneSignal.User.PushSubscription.optedIn !== true) {
    await oneSignal.User.PushSubscription.optIn();
  }

  return (await getBrowserPushDiagnostics()).status;
}

function unwrapFunctionResponse(value: unknown): Record<string, unknown> | null {
  let current = value;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); continue; } catch { return null; }
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "data")) { current = record.data; continue; }
    if (Object.prototype.hasOwnProperty.call(record, "body")) { current = record.body; continue; }
    return record;
  }
  return null;
}

export async function sendBrowserPushTest(subscriptionId: string): Promise<BrowserPushTestResult> {
  const normalizedSubscriptionId = typeof subscriptionId === "string" ? subscriptionId.trim() : "";
  if (!SUBSCRIPTION_ID_PATTERN.test(normalizedSubscriptionId)) {
    throw new Error("A current OneSignal subscription is unavailable.");
  }

  const response = await testBusinessPush({ subscription_id: normalizedSubscriptionId });
  const payload = unwrapFunctionResponse(response);
  const status = payload?.status;
  if (typeof status !== "string" || ![
    "created",
    "created_with_warning",
    "no_target",
    "rejected",
    "invalid_response",
    "unavailable",
  ].includes(status)) {
    throw new Error("The push test returned an unrecognized response.");
  }

  const notificationId = typeof payload.notification_id === "string" ? payload.notification_id : undefined;
  const recipientCount = typeof payload.recipient_count === "number" && Number.isSafeInteger(payload.recipient_count)
    ? payload.recipient_count
    : undefined;
  const httpStatus = typeof payload.http_status === "number" && Number.isInteger(payload.http_status)
    ? payload.http_status
    : undefined;
  const warning = typeof payload.warning === "string" ? payload.warning.slice(0, 240) : undefined;

  return {
    status: status as BrowserPushTestStatus,
    ...(notificationId ? { notificationId } : {}),
    ...(recipientCount !== undefined ? { recipientCount } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(warning ? { warning } : {}),
  };
}

export async function notifyBusinessNotification(event: BusinessNotificationEvent, recordId: string): Promise<void> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) {
    console.warn(`[BusinessNotification] Skipping ${event} because the source record has no id.`);
    return;
  }

  try {
    const result = await sendBusinessNotification({ event, record_id: normalizedRecordId });
    if (result && typeof result === "object" && "error" in result && result.error) {
      throw new Error("The notification service rejected the request.");
    }
  } catch (error) {
    // Owner delivery is deliberately best effort. The business action has already been saved.
    console.error(`[BusinessNotification] ${event} request failed for ${normalizedRecordId}:`, error);
  }
}

export async function notifyBrowserPush(event: BrowserPushEvent, recordId: string): Promise<void> {
  return notifyBusinessNotification(event, recordId);
}
