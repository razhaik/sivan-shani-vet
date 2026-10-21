import { isInstalledApp } from "@/lib/pwa";

const KEY = "crm-standalone-home";

/** Call once the user is logged in to the CRM. */
export function markCrmAsHomeScreenStart() {
  if (!isInstalledApp()) return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

/** True when the installed app should open on the dashboard. */
export function shouldRedirectToCrm(pathname: string): boolean {
  if (!isInstalledApp() || pathname !== "/") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Remove the launch preference after the CRM session ends. */
export function clearCrmAsHomeScreenStart() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
