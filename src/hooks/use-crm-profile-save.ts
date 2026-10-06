import { useEffect, useRef, useState } from "react";
import { User } from "@/entities";
import { uploadFile } from "@/integrations/core";

const PROFILE_OPERATION_TIMEOUT_MS = 30_000;
type ProfileOperation = "upload" | "profile";

class ProfileOperationTimeoutError extends Error {
  readonly operation: ProfileOperation;

  constructor(operation: ProfileOperation) {
    super(operation === "upload" ? "Profile image upload timed out." : "Profile update timed out.");
    this.name = "ProfileOperationTimeoutError";
    this.operation = operation;
  }
}

function withTimeout<T>(promise: PromiseLike<T>, operation: ProfileOperation): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new ProfileOperationTimeoutError(operation));
    }, PROFILE_OPERATION_TIMEOUT_MS);

    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export interface ProfileStatusMessage {
  tone: "error" | "success";
  text: string;
}

interface ProfileSaveOptions {
  isOpen: boolean;
  profile: { fullName: string; imageUrl?: string };
  selectedFile: File | null;
  onClose: (restoreFocus?: boolean) => void;
  onProfileUpdated: (updates: { full_name: string; profile_image_url?: string }) => void;
}

function saveErrorText(error: unknown, operation: ProfileOperation) {
  if (error instanceof ProfileOperationTimeoutError) {
    return operation === "upload"
      ? "העלאת התמונה נמשכה זמן רב מדי. בדקו את החיבור ונסו שוב."
      : "שמירת הפרטים נמשכה זמן רב מדי. בדקו את החיבור ונסו שוב.";
  }
  return operation === "upload"
    ? "העלאת התמונה נכשלה. בדקו את הקובץ ונסו שוב."
    : "שמירת הפרטים נכשלה. נסו שוב בעוד רגע.";
}

export function useCrmProfileSave({ isOpen, profile, selectedFile, onClose, onProfileUpdated }: ProfileSaveOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<ProfileStatusMessage | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const attemptRef = useRef(0);
  isOpenRef.current = isOpen;

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const invalidateSave = () => {
    attemptRef.current += 1;
    isSavingRef.current = false;
    clearCloseTimer();
    if (isMountedRef.current) setIsSaving(false);
  };

  const closeMenu = (restoreFocus = true) => {
    invalidateSave();
    onClose(restoreFocus);
  };

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) {
      invalidateSave();
      setStatus(null);
      return;
    }
    clearCloseTimer();
    isSavingRef.current = false;
    setIsSaving(false);
    setStatus(null);
  }, [isOpen]);

  useEffect(() => () => {
    isMountedRef.current = false;
    attemptRef.current += 1;
    clearCloseTimer();
  }, []);

  const saveProfile = async (draftName: string) => {
    if (isSavingRef.current) return;
    const name = draftName.trim();
    if (!name) {
      setStatus({ tone: "error", text: "כתבו שם מלא כדי לשמור את הפרטים." });
      return;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    isSavingRef.current = true;
    setIsSaving(true);
    setStatus(null);
    let operation: ProfileOperation = "profile";
    let nextImageUrl = profile.imageUrl || "";
    const isCurrentAttempt = () => isMountedRef.current && isOpenRef.current && attemptRef.current === attempt;

    try {
      if (selectedFile) {
        operation = "upload";
        const result = await withTimeout(uploadFile({ file: selectedFile }), "upload");
        nextImageUrl = String(result?.file_url || "").trim();
        if (!nextImageUrl) throw new Error("The uploaded file did not return a URL.");
      }

      operation = "profile";
      const updatePayload: { full_name: string; profile_image_url?: string } = { full_name: name };
      if (nextImageUrl) updatePayload.profile_image_url = nextImageUrl;
      await withTimeout(User.updateProfile(updatePayload), "profile");
      if (!isCurrentAttempt()) return;

      onProfileUpdated({ full_name: name, ...(nextImageUrl ? { profile_image_url: nextImageUrl } : {}) });
      if (!isCurrentAttempt()) return;
      setStatus({ tone: "success", text: "הפרטים נשמרו בהצלחה." });

      const timerAttempt = attempt;
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        if (!isMountedRef.current || !isOpenRef.current || attemptRef.current !== timerAttempt) return;
        closeMenu(true);
      }, 550);
    } catch (error) {
      if (!isCurrentAttempt()) return;
      console.error("Failed to save CRM profile:", error);
      setStatus({ tone: "error", text: saveErrorText(error, operation) });
    } finally {
      if (isMountedRef.current && attemptRef.current === attempt) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  return { isSaving, status, setStatus, saveProfile, closeMenu };
}
