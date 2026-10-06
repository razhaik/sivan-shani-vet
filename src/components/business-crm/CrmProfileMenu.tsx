import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Check, ImagePlus, Loader2, X } from "lucide-react";
import { ProfileAvatar } from "@/components/business-crm/CrmProfileAvatar";
import { useCrmProfileSave } from "@/hooks/use-crm-profile-save";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

type ProfileAnchorRef = { current: HTMLButtonElement | null };
export type CrmProfileUpdate = { full_name: string; profile_image_url?: string };

export interface CrmProfileData {
  fullName: string;
  email: string;
  imageUrl?: string;
}

interface ProfileMenuProps {
  isOpen: boolean;
  anchorRef: ProfileAnchorRef;
  profile: CrmProfileData;
  onClose: (restoreFocus?: boolean) => void;
  onProfileUpdated: (updates: CrmProfileUpdate) => void;
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function CrmProfileMenu({ isOpen, anchorRef, profile, onClose, onProfileUpdated }: ProfileMenuProps) {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [draftName, setDraftName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuId = useId();
  const titleId = `${menuId}-title`;
  const fileInputId = `${menuId}-photo`;
  const { status, isSaving, setStatus, saveProfile, closeMenu } = useCrmProfileSave({ isOpen, profile, selectedFile, onClose, onProfileUpdated });

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      setDraftName("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setDraftName(profile.fullName);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [isOpen]);

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rectangle = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(390, Math.max(0, viewportWidth - 24));
      const left = Math.min(Math.max(12, rectangle.right - width), Math.max(12, viewportWidth - width - 12));
      const preferredTop = rectangle.bottom + 12;
      const naturalHeight = Math.min(560, Math.max(320, viewportHeight - 32));
      const fitsBelow = preferredTop + naturalHeight <= viewportHeight - 12;
      const top = fitsBelow ? preferredTop : Math.max(12, rectangle.top - naturalHeight - 12);
      setPosition({ top, left, width, maxHeight: Math.max(280, Math.min(560, viewportHeight - top - 12)) });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (panelRef.current?.contains(target) || anchorRef.current?.contains(target))) return;
      closeMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, closeMenu, isOpen]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      setStatus({ tone: "error", text: "אפשר להעלות תמונה מסוג JPG, PNG, WEBP או GIF." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setStatus({ tone: "error", text: "התמונה גדולה מדי. אפשר להעלות קובץ עד 5MB." });
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setStatus(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveProfile(draftName);
  };

  if (!isOpen || !position) return null;
  const avatarName = profile.fullName || profile.email || "צוות המרפאה";
  const previewImageUrl = localPreviewUrl || profile.imageUrl;
  return (
    <div
      ref={panelRef}
      id="crm-profile-menu"
      role="dialog"
      aria-labelledby={titleId}
      className="fixed z-[60] flex overflow-hidden rounded-[22px] border border-[#E1E4E8] bg-white shadow-[0_22px_60px_rgba(26,26,62,0.22)]"
      style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
      dir="rtl"
    >
      <div className="flex min-h-0 w-full flex-col">
        <div className="shrink-0 bg-gradient-to-br from-[#1A1A3E] via-[#26264F] to-[#5267A8] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] text-[#F2D162]">הפרטים שלך</p>
              <h2 id={titleId} className="mt-1 text-xl font-black">אזור אישי</h2>
              <p className="mt-1 text-xs font-medium text-white/70">עדכנו את הפרטים שמופיעים בסביבת הניהול.</p>
            </div>
            <button type="button" onClick={() => closeMenu()} aria-label="סגירת האזור האישי" className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex items-center gap-4 rounded-2xl border border-[#EEF0F2] bg-[#FBFCFD] p-3">
              <ProfileAvatar name={avatarName} imageUrl={previewImageUrl} className="h-[76px] w-[76px]" fallbackClassName="text-2xl" imageWidth={160} alt="תמונת פרופיל" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#1A1A3E]">{profile.fullName || "עדיין לא הוגדר שם"}</p>
                <p dir="ltr" className="mt-1 truncate text-xs font-medium text-slate-500">{profile.email || "כתובת האימייל של החשבון"}</p>
                <label htmlFor={fileInputId} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#1A1A3E]/15 bg-white px-3 py-2 text-xs font-extrabold text-[#1A1A3E] shadow-sm transition hover:border-[#1A1A3E]/35 hover:bg-[#F7F7F7] focus-within:ring-2 focus-within:ring-[#F2D162]">
                  <ImagePlus className="h-3.5 w-3.5 text-[#5267A8]" aria-hidden="true" />
                  {selectedFile ? "החלפת תמונה" : "הוספת תמונה"}
                </label>
                <input ref={fileInputRef} id={fileInputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} className="sr-only" />
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><Camera className="h-3.5 w-3.5" aria-hidden="true" /> JPG, PNG, WEBP או GIF, עד 5MB</p>
            <div className="mt-6">
              <label htmlFor={`${menuId}-name`} className="text-sm font-black text-[#1A1A3E]">שם מלא</label>
              <input id={`${menuId}-name`} value={draftName} onChange={(event) => setDraftName(event.target.value)} autoComplete="name" placeholder="השם שיופיע במערכת" className="mt-2 h-11 w-full rounded-xl border border-[#DDE1E6] bg-white px-3 text-sm font-semibold text-[#1A1A3E] outline-none transition placeholder:text-slate-400 focus:border-[#5267A8] focus:ring-2 focus:ring-[#F2D162]/70" dir="rtl" />
              <p className="mt-2 text-[11px] font-medium leading-5 text-slate-500">כתובת האימייל נשארת ללא שינוי ומשמשת כגיבוי להצגה.</p>
            </div>
            {status && <p role={status.tone === "error" ? "alert" : "status"} className={`mt-5 rounded-xl px-3 py-2.5 text-xs font-bold leading-5 ${status.tone === "error" ? "bg-[#FFF1F1] text-[#B63C3C]" : "bg-[#EEF8F2] text-[#2C7A4B]"}`}>{status.text}</p>}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#EEF0F2] bg-[#FBFCFD] px-5 py-4">
            <button type="button" onClick={() => closeMenu()} disabled={isSaving} className="rounded-xl px-3 py-2.5 text-xs font-extrabold text-slate-500 transition hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/20 disabled:cursor-not-allowed disabled:opacity-50">ביטול</button>
            <button type="submit" disabled={isSaving} className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-[#292951] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-wait disabled:opacity-70">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 text-[#F2D162]" aria-hidden="true" />}
              {isSaving ? "שומר..." : "שמירת פרטים"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
