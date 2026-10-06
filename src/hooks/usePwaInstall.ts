import { useCallback, useEffect, useRef, useState } from "react";

type InstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: InstallPromptOutcome;
    platform: string;
  }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export interface PwaInstallState {
  isInstallAvailable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<InstallPromptOutcome | null>;
  clearInstallPrompt: () => void;
}

function detectStandaloneMode() {
  if (typeof window === "undefined") return false;

  const displayModeStandalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as NavigatorWithStandalone).standalone === true;

  return displayModeStandalone || iosStandalone;
}

export function usePwaInstall(): PwaInstallState {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isInstallAvailable, setIsInstallAvailable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const standaloneMediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
    const updateInstalledState = () => setIsInstalled(detectStandaloneMode());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (detectStandaloneMode()) return;
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setIsInstallAvailable(true);
    };
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstallAvailable(false);
      setIsInstalled(true);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (standaloneMediaQuery) {
      if (typeof standaloneMediaQuery.addEventListener === "function") {
        standaloneMediaQuery.addEventListener("change", updateInstalledState);
      } else {
        standaloneMediaQuery.addListener(updateInstalledState);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (standaloneMediaQuery) {
        if (typeof standaloneMediaQuery.removeEventListener === "function") {
          standaloneMediaQuery.removeEventListener("change", updateInstalledState);
        } else {
          standaloneMediaQuery.removeListener(updateInstalledState);
        }
      }
      deferredPromptRef.current = null;
    };
  }, []);

  const clearInstallPrompt = useCallback(() => {
    deferredPromptRef.current = null;
    setIsInstallAvailable(false);
  }, []);

  const promptInstall = useCallback(async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return null;

    deferredPromptRef.current = null;
    setIsInstallAvailable(false);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      return choice.outcome;
    } catch {
      return null;
    }
  }, []);

  return { isInstallAvailable, isInstalled, promptInstall, clearInstallPrompt };
}
