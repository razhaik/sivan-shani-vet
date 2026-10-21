import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileText,
  Globe2,
  Grid2X2,
  Home,
  LayoutDashboard,
  Mail,
  Megaphone,
  ReceiptText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CrmView } from "@/components/business-crm/CrmContext";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { optimizedImageSource, optimizedImageSrcSet, restoreOriginalImage } from "@/lib/optimizedImageUrl";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

export type CrmInstallAction = (trigger: HTMLButtonElement) => Promise<void>;

export type CrmActiveKey =
  | "overview"
  | "inbox"
  | "calendar"
  | "settings"
  | "clients"
  | "sales"
  | "marketing"
  | "marketing-automatic"
  | "marketing-broadcasts"
  | "marketing-sent"
  | "marketing-reports";

interface CrmSidebarProps {
  isOpen: boolean;
  userName: string;
  onClose: () => void;
  onNavigate: (view: CrmView, targetId?: string) => void;
  activeKey?: CrmActiveKey;
  inboxCount?: number;
  onOpenAppMarketplace: (trigger?: HTMLButtonElement) => void;
  onRegisterInstallAction?: (action: CrmInstallAction | null) => void;
}

type NavItem = {
  key?: CrmActiveKey;
  label: string;
  icon: LucideIcon;
  view?: CrmView;
  targetId?: string;
  expandable?: boolean;
  mobileHidden?: boolean;
};

const navItems: NavItem[] = [
  { key: "overview", label: "מסך ניהול", icon: LayoutDashboard, view: { kind: "overview" } },
  { key: "inbox", label: "תיבת דואר", icon: Mail, view: { kind: "inbox" } },
  { key: "calendar", label: "יומן", icon: CalendarDays, view: { kind: "calendar" } },
  { key: "clients", label: "לקוחות", icon: Users, view: { kind: "clients" } },
  { key: "sales", label: "מכירות ונתונים", icon: ReceiptText, view: { kind: "sales" } },
  { label: "קבצים", icon: FileText, mobileHidden: true },
  { key: "marketing", label: "שיווק", icon: Megaphone, view: { kind: "marketing", subview: "automatic" }, expandable: true },
  { label: "לכידת לידים", icon: Globe2, mobileHidden: true },
  { key: "settings", label: "הגדרות", icon: Settings, view: { kind: "settings" } },
];

const logoImage = optimizedImageSource(VETERINARY_CLINIC_PROFILE.logoUrl, { width: 300, fallbackWidth: 180, quality: 72 });
const logoImageSrcSet = optimizedImageSrcSet(VETERINARY_CLINIC_PROFILE.logoUrl, [180, 240, 300], { quality: 72 });

type InstallDialogMode = "instructions" | "installed" | "already-installed" | "dismissed";
type InstallPlatform = "ios" | "android" | "desktop" | "other";

type InstallDialogProps = {
  mode: InstallDialogMode;
  platform: InstallPlatform;
  onClose: () => void;
  returnFocusRef: { current: HTMLButtonElement | null };
};

function InstallDialog({ mode, platform, onClose, returnFocusRef }: InstallDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isConfirmation = mode === "installed" || mode === "already-installed";
  const title = mode === "installed" ? "האפליקציה נוספה" : mode === "already-installed" ? "האפליקציה כבר מותקנת" : mode === "dismissed" ? "ההתקנה לא אושרה" : "הוספה למסך הבית";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")).filter((element) => !element.hasAttribute("aria-hidden"));
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        const returnFocusTarget = returnFocusRef.current;
        if (returnFocusTarget && document.contains(returnFocusTarget)) returnFocusTarget.focus();
      });
    };
  }, [mode, onClose, returnFocusRef]);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#1A1A3E]/[0.52] p-4 backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-install-dialog-title"
        aria-describedby="crm-install-dialog-description"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.6rem] border border-[#1A1A3E]/10 bg-[#FFFDF5] p-5 text-[#1A1A3E] shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F2D162] text-[#1A1A3E] shadow-sm">
              {isConfirmation ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <Home className="h-6 w-6" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.18em] text-[#1A1A3E]/[0.52]">סביבת הניהול</p>
              <h2 id="crm-install-dialog-title" className="mt-1 text-xl font-black leading-tight sm:text-2xl">{title}</h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-[#1A1A3E]/[0.62] transition hover:bg-[#1A1A3E]/[0.07] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/40"
            aria-label="סגירת חלון ההוספה למסך הבית"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {mode === "already-installed" && (
          <div id="crm-install-dialog-description" className="mt-6 rounded-2xl border border-emerald-700/15 bg-emerald-50 px-4 py-4 text-right text-sm font-bold leading-6 text-emerald-950">
            סביבת הניהול כבר מותקנת במכשיר הזה. אפשר לפתוח אותה ממסך הבית כדי להגיע במהירות ליומן, ללקוחות ולהודעות.
          </div>
        )}

        {mode === "installed" && (
          <div id="crm-install-dialog-description" className="mt-6 rounded-2xl border border-emerald-700/15 bg-emerald-50 px-4 py-4 text-right text-sm font-bold leading-6 text-emerald-950">
            סביבת הניהול נוספה למסך הבית. אפשר לפתוח אותה משם בכל פעם שצריך לנהל את המרפאה.
          </div>
        )}

        {mode === "dismissed" && (
          <div id="crm-install-dialog-description" className="mt-6 rounded-2xl border border-amber-700/15 bg-amber-50 px-4 py-4 text-right text-sm font-bold leading-6 text-amber-950">
            חלון ההתקנה נסגר בלי אישור. סביבת הניהול לא נוספה למסך הבית. אפשר לנסות שוב מהתפריט כשמתאים.
          </div>
        )}

        {mode === "instructions" && (
          <div id="crm-install-dialog-description" className="mt-5 text-right">
            <p className="text-sm font-semibold leading-6 text-[#1A1A3E]/[0.74]">
              {platform === "ios" ? "ב-iPhone וב-iPad הדפדפן לא מציג חלון התקנה אוטומטי. פתחו את תפריט השיתוף כדי להוסיף את סביבת הניהול למסך הבית." : platform === "android" ? "הדפדפן לא פתח חלון התקנה. אם אפשרות ההתקנה זמינה, היא נמצאת בתפריט הדפדפן." : platform === "desktop" ? "הדפדפן לא פתח חלון התקנה. חפשו אפשרות התקנה בשורת הכתובת או בתפריט." : "לא ניתן לפתוח חלון התקנה בדפדפן הנוכחי. בדקו בתפריט אם קיימת אפשרות להוסיף את האתר."}
            </p>
            <ol className="mt-5 space-y-3">
              {platform === "ios" ? (
                <>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">1</span>
                    <span>לחצו על כפתור השיתוף בדפדפן.</span>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">2</span>
                    <span>בחרו באפשרות ״הוספה למסך הבית״.</span>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">3</span>
                    <span>אשרו בלחיצה על ״הוספה״.</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">1</span>
                    <span>{platform === "desktop" ? "חפשו סמל התקנה בשורת הכתובת או פתחו את תפריט הדפדפן." : "פתחו את תפריט הדפדפן."}</span>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">2</span>
                    <span>{platform === "desktop" ? "בחרו ״התקנת אפליקציה״." : platform === "android" ? "בחרו ״התקנת אפליקציה״ או ״הוספה למסך הבית״." : "בדקו אם מופיעה ״התקנת אפליקציה״ או ״הוספה למסך הבית״."}</span>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl bg-[#F2D162]/[0.25] px-3 py-3 text-sm font-bold leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1A3E] text-xs text-white">3</span>
                    <span>אשרו את ההוספה בחלון שיופיע.</span>
                  </li>
                </>
              )}
            </ol>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#1A1A3E] px-4 text-sm font-black text-white transition hover:bg-[#29295A] focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/40 focus:ring-offset-2"
        >
          {isConfirmation ? "סגירה" : "הבנתי"}
        </button>
      </div>
    </div>
  );
}

interface SidebarPanelProps extends Pick<CrmSidebarProps, "userName" | "onClose" | "onNavigate" | "activeKey" | "inboxCount" | "onOpenAppMarketplace"> {
  onInstall: (trigger: HTMLButtonElement) => void;
}

function SidebarPanel({ userName, onClose, onNavigate, activeKey, inboxCount, onOpenAppMarketplace, onInstall }: SidebarPanelProps) {
  const [logoFailed, setLogoFailed] = useState(!VETERINARY_CLINIC_PROFILE.logoUrl.trim());
  const marketingActive = activeKey === "marketing" || Boolean(activeKey?.startsWith("marketing-"));
  const marketingLinks: Array<{ key: CrmActiveKey; label: string; view: CrmView }> = [
    { key: "marketing-automatic", label: "קמפיינים אוטומטיים", view: { kind: "marketing", subview: "automatic" } },
    { key: "marketing-broadcasts", label: "הודעות שיווקיות", view: { kind: "marketing", subview: "broadcasts" } },
    { key: "marketing-sent", label: "קמפיינים והודעות שנשלחו", view: { kind: "marketing", subview: "sent" } },
    { key: "marketing-reports", label: 'דו"חות', view: { kind: "marketing", subview: "reports" } },
  ];

  return (
    <div dir="rtl" className="flex h-full flex-col overflow-y-auto px-4 py-5 text-[#1A1A3E]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center justify-center px-3 py-3">
          {logoFailed ? (
            <div
              role="img"
              aria-label={VETERINARY_CLINIC_PROFILE.businessName}
              className="flex min-h-16 w-full items-center justify-center rounded-2xl border border-[#1A1A3E]/10 bg-white/35 px-3 text-center text-sm font-black leading-5 text-[#1A1A3E]"
            >
              {VETERINARY_CLINIC_PROFILE.businessName || VETERINARY_CLINIC_PROFILE.shortName || VETERINARY_CLINIC_PROFILE.categoryLabel}
            </div>
          ) : (
            <img
              src={logoImage.src}
              srcSet={logoImageSrcSet}
              sizes="240px"
              alt={VETERINARY_CLINIC_PROFILE.businessName}
              loading="eager"
              decoding="async"
              onError={(event) => {
                const image = event.currentTarget;
                const fallbackAttempted = image.dataset.optimizedFallbackApplied === "true"
                  || !logoImage.fallbackSrc
                  || image.src === logoImage.fallbackSrc
                  || image.currentSrc === logoImage.fallbackSrc;
                restoreOriginalImage(event, logoImage.fallbackSrc);
                if (fallbackAttempted) setLogoFailed(true);
              }}
              className="h-16 w-full object-contain"
            />
          )}
        </div>
        <button type="button" onClick={onClose} className="mt-1 rounded-xl p-2 text-[#1A1A3E]/[0.65] transition hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/40 lg:hidden" aria-label="סגירת תפריט">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="ניווט ראשי" className="space-y-1">
        {navItems.map((item) => {
          const { label, icon: Icon, expandable, key, view, targetId } = item;
          const active = key === activeKey || (key === "marketing" && marketingActive);
          const className = `group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-[13px] font-bold transition ${active ? "bg-[#1A1A3E] text-white shadow-md shadow-[#1A1A3E]/[0.15]" : "text-[#1A1A3E]/[0.75] hover:bg-white/[0.45] hover:text-[#1A1A3E]"}`;
          const content = <><Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[#F2D162]" : "text-[#1A1A3E]/[0.70]"}`} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{label}</span>{label === "תיבת דואר" && Boolean(inboxCount && inboxCount > 0) && <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black leading-4 ${active ? "bg-[#F2D162] text-[#1A1A3E]" : "bg-white/70 text-[#1A1A3E]"}`} aria-label={`${inboxCount} הודעות בתיבת הדואר`}>{inboxCount! > 99 ? "99+" : inboxCount}</span>}{expandable && <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />}</>;
          const itemButton = view ? <button type="button" onClick={() => onNavigate(view, targetId)} aria-current={active ? "page" : undefined} className={className}>{content}</button> : <button type="button" disabled title="אפשרות זו תתחבר בהמשך" className={`${className} cursor-not-allowed opacity-70`} aria-label={`${label}, בקרוב`}>{content}</button>;
          return <div key={label} className={item.mobileHidden ? "crm-mobile-hidden-nav-entry" : undefined}>{itemButton}{key === "marketing" && marketingActive && <div className="mr-3 mt-1 space-y-1 border-r border-[#1A1A3E]/20 pr-3" aria-label="ניווט שיווק">{marketingLinks.map((link) => { const linkActive = link.key === activeKey; return <button key={link.key} type="button" onClick={() => onNavigate(link.view)} aria-current={linkActive ? "page" : undefined} className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-right text-[11px] font-extrabold transition ${linkActive ? "bg-white/75 text-[#1A1A3E]" : "text-[#1A1A3E]/[0.65] hover:bg-white/[0.45] hover:text-[#1A1A3E]"}`}><span className={`h-1.5 w-1.5 rounded-full ${linkActive ? "bg-[#1A1A3E]" : "bg-[#1A1A3E]/[0.35]"}`} />{link.label}</button>; })}</div>}</div>;
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <button type="button" onClick={(event) => onOpenAppMarketplace(event.currentTarget)} aria-haspopup="dialog" className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#1A1A3E]/[0.15] bg-white/[0.55] px-3 text-right text-[12px] font-extrabold text-[#1A1A3E] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/40">
          <Grid2X2 className="h-4 w-4" aria-hidden="true" /><span className="flex-1">חנות אפליקציות</span>
        </button>
        <button type="button" onClick={(event) => { void onInstall(event.currentTarget); }} aria-haspopup="dialog" className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#1A1A3E]/[0.15] bg-white/[0.55] px-3 text-right text-[12px] font-extrabold text-[#1A1A3E] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A3E]/40">
          <Home className="h-4 w-4" aria-hidden="true" /><span className="flex-1">הוספה למסך הבית</span>
        </button>
        <div className="border-t border-[#1A1A3E]/10 pt-3"><p dir={userName.includes("@") ? "ltr" : "rtl"} className="truncate text-xs font-extrabold">{userName}</p><p className="mt-1 text-[11px] font-medium text-[#1A1A3E]/[0.60]">צוות המרפאה</p></div>
      </div>
    </div>
  );
}

export function CrmSidebar({ isOpen, userName, onClose, onNavigate, onOpenAppMarketplace, onRegisterInstallAction, activeKey = "overview", inboxCount = 0 }: CrmSidebarProps) {
  const { isInstalled, promptInstall } = usePwaInstall();
  const [installDialog, setInstallDialog] = useState<InstallDialogMode | null>(null);
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>("other");
  const installTriggerRef = useRef<HTMLButtonElement | null>(null);
  const installAttemptRef = useRef(false);

  const closeInstallDialog = useCallback(() => setInstallDialog(null), []);
  const handleInstall = useCallback(async (trigger: HTMLButtonElement) => {
    if (installAttemptRef.current) return;
    installAttemptRef.current = true;
    installTriggerRef.current = trigger;
    onClose();

    try {
      if (isInstalled) {
        setInstallDialog("already-installed");
        return;
      }

      // Always ask the shared PWA controller directly. Availability state can
      // lag the event by a render, while the one-use prompt is consumed safely.
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        setInstallDialog("installed");
        return;
      }
      if (outcome === "dismissed") {
        setInstallDialog("dismissed");
        return;
      }

      setInstallPlatform(detectInstallPlatform());
      setInstallDialog("instructions");
    } finally {
      installAttemptRef.current = false;
    }
  }, [isInstalled, onClose, promptInstall]);

  useEffect(() => {
    if (!onRegisterInstallAction) return;
    onRegisterInstallAction(handleInstall);
    return () => onRegisterInstallAction(null);
  }, [handleInstall, onRegisterInstallAction]);

  useEffect(() => {
    if (isInstalled && installDialog === "instructions") setInstallDialog("already-installed");
  }, [installDialog, isInstalled]);

  const panelProps: SidebarPanelProps = { userName, onClose, onNavigate, onOpenAppMarketplace, activeKey, inboxCount, onInstall: handleInstall };

  return <>
    <aside className="fixed inset-y-0 right-0 z-40 hidden w-[248px] bg-[#F2D162] shadow-[-10px_0_35px_-28px_rgba(26,26,62,0.6)] lg:flex"><SidebarPanel {...panelProps} /></aside>
    <AnimatePresence>
      {isOpen && <motion.div className="crm-mobile-sidebar-drawer fixed inset-0 z-[70] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button type="button" aria-label="סגירת תפריט הצד" onClick={onClose} className="absolute inset-0 h-full w-full bg-[#1A1A3E]/[0.35] backdrop-blur-[2px]" /><motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 30 }} className="absolute inset-y-0 right-0 w-[min(86vw,320px)] bg-[#F2D162] shadow-2xl"><SidebarPanel {...panelProps} /></motion.aside></motion.div>}
    </AnimatePresence>
    {installDialog && <InstallDialog mode={installDialog} platform={installPlatform} onClose={closeInstallDialog} returnFocusRef={installTriggerRef} />}
  </>;
}

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleMobile) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Windows|Macintosh|Mac OS|X11|Linux/i.test(userAgent)) return "desktop";
  return "other";
}
