import { useCallback, useState } from "react";
import { useInstallPrompt } from "@/lib/pwa";

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaInstallState {
  isInstallAvailable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<InstallPromptOutcome>;
}

/**
 * CRM adapter for Buildy's shared PWA install prompt.
 * The browser event is captured once by the shared PWA module, even when it
 * arrives before the authenticated CRM shell mounts.
 */
export function usePwaInstall(): PwaInstallState {
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [installationAccepted, setInstallationAccepted] = useState(false);

  const promptInstall = useCallback(async () => {
    const outcome = await install();
    if (outcome === "accepted") setInstallationAccepted(true);
    return outcome;
  }, [install]);

  return {
    isInstallAvailable: canInstall && !isInstalled && !installationAccepted,
    isInstalled: isInstalled || installationAccepted,
    promptInstall,
  };
}
