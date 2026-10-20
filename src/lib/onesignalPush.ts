import { sendBusinessNotification } from "@/functions";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const ONESIGNAL_APP_ID = "f6159636-c2ad-4e16-93c8-82845591b906";
const ONESIGNAL_SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const ONESIGNAL_WORKER_PATH = "OneSignalSDKWorker.js";
const ONESIGNAL_ORIGIN = new URL(VETERINARY_CLINIC_PROFILE.publicOrigin).origin;

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
export type BrowserPushStatus = "loading" | "ready" | "subscribed" | "unsupported" | "denied" | "unconfigured" | "origin-mismatch" | "error";

export type BrowserPushReadinessInput = {
  configured: boolean;
  originMatches: boolean;
  supported: boolean;
  permission: NotificationPermission;
  optedIn: boolean;
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
  serviceWorkerParam: { scope: "/" },
  notifyButton: { enable: false },
  promptOptions: {
    slidedown: {
      prompts: [{ type: "push", autoPrompt: false }],
    },
  },
};

let oneSignalPromise: Promise<OneSignalInstance> | null = null;

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

  oneSignalPromise = new Promise<OneSignalInstance>((resolve, reject) => {
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
  }).catch((error) => {
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

export async function getBrowserPushStatus(): Promise<BrowserPushStatus> {
  const preflightStatus = getBrowserPushPreflightStatus();
  if (preflightStatus) return preflightStatus;

  try {
    const oneSignal = await loadOneSignal();
    return readBrowserPushStatus(oneSignal);
  } catch (error) {
    console.error("[OneSignal] Could not check browser notification status:", error);
    return "error";
  }
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

  return readBrowserPushStatus(oneSignal);
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
