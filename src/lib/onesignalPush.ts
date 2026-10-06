import { sendBusinessNotification } from "@/functions";

const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const ONESIGNAL_WORKER_PATH = "OneSignalSDKWorker.js";

type OneSignalInitOptions = {
  appId: string;
  serviceWorkerPath: string;
  serviceWorkerParam: { scope: string };
  allowLocalhostAsSecureOrigin: boolean;
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
      optIn: () => Promise<void>;
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
export type BrowserPushStatus = "loading" | "ready" | "subscribed" | "unsupported" | "denied" | "unconfigured" | "error";

const initOptions: OneSignalInitOptions = {
  appId: ONESIGNAL_APP_ID,
  serviceWorkerPath: ONESIGNAL_WORKER_PATH,
  serviceWorkerParam: { scope: "/" },
  allowLocalhostAsSecureOrigin: true,
  promptOptions: {
    slidedown: {
      prompts: [{ type: "push", autoPrompt: false }],
    },
  },
};

let oneSignalPromise: Promise<OneSignalInstance> | null = null;
const UNCONFIGURED_WEB_PUSH_MESSAGE = "App not configured for web push";

function isUnconfiguredWebPushError(error: unknown): boolean {
  const visited = new Set<object>();

  const inspect = (value: unknown): boolean => {
    if (value === null || typeof value !== "object" || visited.has(value)) return false;
    visited.add(value);

    if (value instanceof Error && value.message === UNCONFIGURED_WEB_PUSH_MESSAGE) return true;

    const record = value as Record<string, unknown>;
    if (record.message === UNCONFIGURED_WEB_PUSH_MESSAGE) return true;

    return ["value", "error", "cause"].some((key) => inspect(record[key]));
  };

  return inspect(error);
}

function canUseBrowserPush(): boolean {
  return typeof window !== "undefined"
    && typeof document !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator;
}

function loadOneSignal(): Promise<OneSignalInstance> {
  if (!canUseBrowserPush()) {
    return Promise.reject(new Error("Browser push is not supported in this environment."));
  }

  if (oneSignalPromise) return oneSignalPromise;

  oneSignalPromise = new Promise<OneSignalInstance>((resolve, reject) => {
    let settled = false;
    const finishResolve = (instance: OneSignalInstance) => {
      if (settled) return;
      settled = true;
      resolve(instance);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("OneSignal could not be loaded."));
    };

    const deferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred = deferred;
    deferred.push(async (oneSignal) => {
      try {
        await oneSignal.init(initOptions);
        finishResolve(oneSignal);
      } catch (error) {
        finishReject(error);
      }
    });

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${ONESIGNAL_SDK_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("error", () => finishReject(new Error("OneSignal script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = ONESIGNAL_SDK_URL;
    script.async = true;
    script.defer = true;
    script.dataset.onesignalSdk = "true";
    script.addEventListener("error", () => finishReject(new Error("OneSignal script failed to load.")), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    oneSignalPromise = null;
    const ownedScript = document.querySelector<HTMLScriptElement>('script[data-onesignal-sdk="true"]');
    ownedScript?.remove();
    throw error;
  });

  return oneSignalPromise;
}

function readBrowserPushStatus(oneSignal: OneSignalInstance): BrowserPushStatus {
  if (!oneSignal.Notifications.isPushSupported()) return "unsupported";
  if (window.Notification.permission === "denied") return "denied";
  if (oneSignal.Notifications.permission && oneSignal.User.PushSubscription.optedIn) return "subscribed";
  return "ready";
}

export async function getBrowserPushStatus(): Promise<BrowserPushStatus> {
  if (!canUseBrowserPush()) return "unsupported";

  try {
    const oneSignal = await loadOneSignal();
    return readBrowserPushStatus(oneSignal);
  } catch (error) {
    if (isUnconfiguredWebPushError(error)) return "unconfigured";
    console.error("[OneSignal] Could not check browser notification status:", error);
    return "error";
  }
}

export async function requestBrowserPushPermission(): Promise<BrowserPushStatus> {
  if (!canUseBrowserPush()) return "unsupported";

  try {
    const oneSignal = await loadOneSignal();
    if (!oneSignal.Notifications.isPushSupported()) return "unsupported";
    if (window.Notification.permission === "denied") return "denied";

    await oneSignal.Notifications.requestPermission();

    if (window.Notification.permission === "granted" && !oneSignal.User.PushSubscription.optedIn) {
      await oneSignal.User.PushSubscription.optIn();
    }

    return readBrowserPushStatus(oneSignal);
  } catch (error) {
    if (isUnconfiguredWebPushError(error)) return "unconfigured";
    throw error;
  }
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
