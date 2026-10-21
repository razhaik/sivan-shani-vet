import { useEffect, useId, useRef, useState } from "react";
import { Bell, Menu, Search, Sparkles } from "lucide-react";
import { CrmProfileMenu, type CrmProfileUpdate } from "@/components/business-crm/CrmProfileMenu";
import { ProfileAvatar } from "@/components/business-crm/CrmProfileAvatar";
import { VETERINARY_CLINIC_PROFILE, clinicDisplayLabel } from "@/lib/clinicProfile";

export type CrmOpenItemKind = "inquiry" | "appointment" | "reschedule_request";
export interface CrmOpenItem {
  id: string;
  kind: CrmOpenItemKind;
  typeLabel: string;
  name: string;
  detail: string;
  dateLabel: string;
  sortTimestamp: number;
}
interface CrmTopbarProps {
  userLabel: string;
  profileName: string;
  profileEmail: string;
  profileImageUrl?: string;
  onProfileUpdated: (updates: CrmProfileUpdate) => void;
  notificationCount: number;
  openItems: CrmOpenItem[];
  search: string;
  onSearch: (value: string) => void;
  onOpenSidebar: () => void;
  onOpenAssistant: () => void;
  assistantOpen: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
}
interface PopoverPosition { top: number; left: number; width: number; maxHeight: number; }

export function CrmTopbar({
  userLabel,
  profileName,
  profileEmail,
  profileImageUrl,
  onProfileUpdated,
  notificationCount,
  openItems,
  search,
  onSearch,
  onOpenSidebar,
  onOpenAssistant,
  assistantOpen,
  searchPlaceholder = "חיפוש",
  searchAriaLabel = "חיפוש לקוחות ופגישות",
}: CrmTopbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();
  const popoverTitleId = `${popoverId}-title`;

  useEffect(() => {
    if (!isOpen) { setPopoverPosition(null); return; }
    const updatePosition = () => {
      const anchor = bellRef.current;
      if (!anchor) return;
      const rectangle = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(360, Math.max(0, viewportWidth - 32));
      const maxLeft = Math.max(16, viewportWidth - width - 16);
      const preferredLeft = rectangle.right - width;
      const left = Math.min(Math.max(16, preferredLeft), maxLeft);
      const preferredTop = rectangle.bottom + 10;
      const naturalHeight = Math.min(460, Math.max(160, viewportHeight - 32));
      const fitsBelow = preferredTop + naturalHeight <= viewportHeight - 16;
      const top = fitsBelow ? preferredTop : Math.max(16, rectangle.top - naturalHeight - 10);
      const maxHeight = Math.max(120, Math.min(460, viewportHeight - top - 16));
      setPopoverPosition({ top, left, width, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (popoverRef.current?.contains(target) || bellRef.current?.contains(target))) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      bellRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutsidePointer); document.removeEventListener("keydown", closeOnEscape); };
  }, [isOpen]);

  const toggleOpenItems = () => {
    if (isOpen) { setIsOpen(false); bellRef.current?.focus(); return; }
    setPopoverPosition(null);
    setIsOpen(true);
  };
  const toggleProfile = () => {
    if (isProfileOpen) { setIsProfileOpen(false); profileButtonRef.current?.focus(); return; }
    setIsProfileOpen(true);
  };
  const closeProfile = (restoreFocus = true) => {
    setIsProfileOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => profileButtonRef.current?.focus());
  };
  const itemsSummary = openItems.length === 0
    ? "אין פניות או בקשות תור פתוחות"
    : openItems.length === 1 ? "פריט אחד ממתין לטיפול" : `${openItems.length} פריטים ממתינים לטיפול`;

  return (
    <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-[#F7F7F7]/95 backdrop-blur-md" dir="rtl">
      <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={onOpenSidebar} className="crm-phone-hamburger rounded-xl border border-[#E5E7EB] bg-white p-2.5 text-[#1A1A3E] shadow-sm transition hover:border-[#1A1A3E]/[0.25] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/30 lg:hidden" aria-label="פתיחת תפריט ניווט"><Menu className="h-5 w-5" /></button>
          <button ref={profileButtonRef} type="button" onClick={toggleProfile} aria-label={`פתיחת אזור אישי של ${userLabel}`} aria-haspopup="dialog" aria-expanded={isProfileOpen} aria-controls="crm-profile-menu" className="group flex min-w-0 shrink-0 items-center gap-2 rounded-2xl p-1.5 text-right transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#F2D162] sm:gap-3">
            <ProfileAvatar name={userLabel} imageUrl={profileImageUrl} className="h-10 w-10" fallbackClassName="text-sm" imageWidth={80} />
            <span className="hidden min-w-0 sm:block"><span dir={userLabel.includes("@") ? "ltr" : "rtl"} className="block max-w-[150px] truncate text-sm font-extrabold text-[#1A1A3E]">{userLabel}</span><span className="mt-0.5 block max-w-[180px] truncate text-[11px] font-semibold text-slate-500">{clinicDisplayLabel(VETERINARY_CLINIC_PROFILE)}</span></span>
          </button>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2.5">
          <label className="relative min-w-0 flex-1 sm:max-w-[360px]"><span className="sr-only">{searchAriaLabel}</span><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} aria-label={searchAriaLabel} className="h-10 w-full rounded-xl border border-[#E1E4E8] bg-white pr-9 text-sm font-semibold text-[#1A1A3E] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]/60" dir="rtl" /></label>
          <button ref={bellRef} type="button" onClick={toggleOpenItems} title={notificationCount ? `${notificationCount} התראות` : "אין התראות חדשות"} aria-label={notificationCount ? `${notificationCount} התראות` : "אין התראות חדשות"} aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={popoverId} className="crm-topbar-touch-target relative rounded-xl p-2.5 text-slate-500 transition hover:bg-white hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/[0.25]"><Bell className="h-[18px] w-[18px]" />{notificationCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#D94C4C] px-1.5 py-0.5 text-center text-[10px] font-black leading-4 text-white ring-2 ring-[#F7F7F7]">{notificationCount > 99 ? "99+" : notificationCount}</span>}</button>
          <button type="button" onClick={onOpenAssistant} title="עוזר AI" aria-label="עוזר AI" aria-haspopup="dialog" aria-expanded={assistantOpen} aria-controls="crm-assistant-panel" className={`crm-topbar-touch-target rounded-xl p-2.5 transition focus:outline-none focus:ring-2 focus:ring-[#6D5ACF]/[0.25] ${assistantOpen ? "bg-[#6D5ACF] text-white shadow-sm hover:bg-[#5E4DBA]" : "text-[#6D5ACF] hover:bg-[#EEEAFE]"}`}><Sparkles className="h-[18px] w-[18px]" /></button>
        </div>
      </div>
      {isOpen && popoverPosition && <div ref={popoverRef} id={popoverId} role="dialog" aria-labelledby={popoverTitleId} className="fixed z-50 flex overflow-hidden rounded-2xl border border-[#E1E4E8] bg-white shadow-[0_18px_48px_rgba(26,26,62,0.18)]" style={{ top: popoverPosition.top, left: popoverPosition.left, width: popoverPosition.width, maxHeight: popoverPosition.maxHeight }} dir="rtl"><div className="flex min-h-0 w-full flex-col"><div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#EEF0F2] px-4 py-3"><div className="min-w-0"><h2 id={popoverTitleId} className="text-sm font-black text-[#1A1A3E]">דברים פתוחים</h2><p className="mt-0.5 text-[11px] font-semibold text-slate-500">{itemsSummary}</p></div><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#F2D162]" aria-hidden="true" /></div>{openItems.length > 0 ? <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2" role="list" aria-label="דברים פתוחים">{openItems.map((item) => <li key={item.id} className="rounded-xl border border-[#EEF0F2] bg-[#FBFCFD] p-3 transition hover:border-[#D9DDE3]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "appointment" ? "bg-[#5267A8]" : item.kind === "reschedule_request" ? "bg-[#D99A2B]" : "bg-[#D94C4C]"}`} aria-hidden="true" /><div className="min-w-0"><p className="truncate text-[11px] font-black text-slate-500">{item.typeLabel}</p><p className="mt-0.5 truncate text-sm font-extrabold text-[#1A1A3E]">{item.name}</p></div></div><span className="shrink-0 text-[10px] font-bold text-slate-400">{item.dateLabel}</span></div><p className="mt-2 max-h-10 overflow-hidden break-words text-xs font-medium leading-5 text-slate-600">{item.detail}</p></li>)}</ul> : <div className="flex min-h-[150px] flex-col items-center justify-center px-5 py-8 text-center" role="status"><Bell className="h-6 w-6 text-slate-300" aria-hidden="true" /><p className="mt-3 text-sm font-extrabold text-[#1A1A3E]">אין דברים פתוחים</p><p className="mt-1 max-w-[240px] text-xs font-medium leading-5 text-slate-500">פניות חדשות, בקשות תור ובקשות שינוי מועד יופיעו כאן.</p></div>}</div></div>}
      {isProfileOpen && <CrmProfileMenu isOpen anchorRef={profileButtonRef} profile={{ fullName: profileName, email: profileEmail, imageUrl: profileImageUrl }} onClose={closeProfile} onProfileUpdated={onProfileUpdated} />}
    </header>
  );
}
