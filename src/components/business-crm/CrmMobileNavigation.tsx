import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  Ellipsis,
  Grid2X2,
  Home,
  Mail,
  Megaphone,
  ReceiptText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CrmView } from "@/components/business-crm/CrmContext";

type MobileTab = {
  label: string;
  icon: LucideIcon;
  view?: CrmView;
};

const mobileTabs: MobileTab[] = [
  { label: "מכירות ונתונים", icon: ReceiptText, view: { kind: "sales" } },
  { label: "יומן", icon: CalendarDays, view: { kind: "calendar" } },
  { label: "לקוחות", icon: Users, view: { kind: "clients" } },
  { label: "תיבת דואר", icon: Mail, view: { kind: "inbox" } },
  { label: "עוד", icon: Ellipsis },
];

interface CrmMobileNavigationProps {
  view: CrmView;
  onNavigate: (view: CrmView) => void;
  onOpenAppMarketplace: (trigger?: HTMLButtonElement) => void;
  onAddToHomeScreen: (trigger: HTMLButtonElement) => void;
}

function isMoreSection(view: CrmView) {
  return view.kind === "marketing" || view.kind === "settings";
}

function isActiveTab(tab: MobileTab, view: CrmView) {
  if (tab.label === "עוד") return isMoreSection(view);
  if (tab.view?.kind === "sales") return view.kind === "sales";
  if (tab.view?.kind === "overview") return view.kind === "overview";
  if (tab.view?.kind === "calendar") return view.kind === "calendar";
  if (tab.view?.kind === "clients") return view.kind === "clients" || view.kind === "client-details";
  if (tab.view?.kind === "inbox") return view.kind === "inbox";
  return false;
}

function MoreAction({
  label,
  icon: Icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[58px] w-full items-center gap-3 rounded-2xl border px-4 text-right transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D162] ${active ? "border-[#1A1A3E]/15 bg-[#F3F4FA] text-[#1A1A3E]" : "border-[#E9EBF0] bg-white text-[#1A1A3E] hover:border-[#D9DEE8] hover:bg-[#FBFCFD]"}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#1A1A3E] text-[#F2D162]" : "bg-[#F3F4FA] text-[#5267A8]"}`} aria-hidden="true">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-extrabold">{label}</span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    </button>
  );
}

export default function CrmMobileNavigation({ view, onNavigate, onOpenAppMarketplace, onAddToHomeScreen }: CrmMobileNavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const moreDragControls = useDragControls();
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  const closeMore = (restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setMoreOpen(false);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMore(true);
        return;
      }
      if (event.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current) window.requestAnimationFrame(() => moreButtonRef.current?.focus());
    };
  }, [moreOpen]);

  const navigateTo = (nextView: CrmView) => {
    closeMore(false);
    onNavigate(nextView);
  };

  const openMarketplace = (trigger: HTMLButtonElement) => {
    const returnFocusTarget = moreButtonRef.current || trigger;
    closeMore(false);
    onOpenAppMarketplace(returnFocusTarget);
  };

  const requestInstall = (trigger: HTMLButtonElement) => {
    const returnFocusTarget = moreButtonRef.current || trigger;
    // Start the browser prompt within this tap before the sheet begins closing.
    onAddToHomeScreen(returnFocusTarget);
    closeMore(false);
  };

  return (
    <>
      <motion.nav
        dir="rtl"
        aria-label="ניווט ראשי"
        className="crm-mobile-navigation fixed inset-x-0 bottom-0 z-[60]"
        initial={reduceMotion ? false : { y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="crm-mobile-navigation-row">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActiveTab(tab, view);
            const isMore = tab.label === "עוד";
            return isMore ? (
              <button
                key={tab.label}
                ref={moreButtonRef}
                type="button"
                onClick={() => moreOpen ? closeMore(true) : (restoreFocusRef.current = true, setMoreOpen(true))}
                aria-label="עוד פעולות"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-controls={dialogId}
                className={`crm-mobile-navigation-item ${active || moreOpen ? "is-active" : ""}`}
              >
                <Icon className="h-[21px] w-[21px]" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            ) : (
              <button
                key={tab.label}
                type="button"
                onClick={() => tab.view && onNavigate(tab.view)}
                aria-current={active ? "page" : undefined}
                className={`crm-mobile-navigation-item ${active ? "is-active" : ""}`}
              >
                <Icon className="h-[21px] w-[21px]" aria-hidden="true" />
                <span className={tab.view?.kind === "sales" ? "whitespace-normal leading-[1.1]" : undefined}>
                  {tab.view?.kind === "sales" ? <>מכירות<br />ונתונים</> : tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="crm-mobile-more-overlay fixed inset-0 z-[80] flex items-end justify-center bg-[#1A1A3E]/[0.4] px-3 backdrop-blur-[2px]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeMore(true);
            }}
          >
            <motion.section
              ref={sheetRef}
              id={dialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              dir="rtl"
              className="crm-mobile-more-sheet w-full max-w-lg rounded-t-[28px] border border-[#E5E7EB] bg-white px-4 pb-5 pt-4 shadow-[0_-18px_50px_rgba(26,26,62,0.18)]"
              initial={reduceMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={reduceMotion ? { y: 0 } : { y: "100%" }}
              drag="y"
              dragControls={moreDragControls}
              dragListener={false}
              dragDirectionLock
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.65 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (info.offset.y > 96 || (info.offset.y > 24 && info.velocity.y > 600)) closeMore(true);
              }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }}
            >
              <div
                className="mx-auto mb-2 flex h-10 w-16 touch-none select-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                aria-hidden="true"
                onPointerDown={(event) => moreDragControls.start(event)}
              >
                <span className="h-1 w-10 rounded-full bg-[#D9DEE5]" />
              </div>
              <header className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[0.16em] text-[#5267A8]">סביבת הניהול</p>
                  <h2 id={titleId} className="mt-1 text-xl font-black text-[#1A1A3E]">עוד אזורי ניהול</h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => closeMore(true)}
                  aria-label="סגירת תפריט עוד"
                  className="rounded-xl p-2 text-slate-500 transition hover:bg-[#F0F1F5] hover:text-[#1A1A3E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A3E]/30"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </header>

              <nav aria-label="אזורים נוספים" className="space-y-2">
                <MoreAction label="שיווק" icon={Megaphone} active={view.kind === "marketing"} onClick={() => navigateTo({ kind: "marketing", subview: "automatic" })} />
                <MoreAction label="הגדרות" icon={Settings} active={view.kind === "settings"} onClick={() => navigateTo({ kind: "settings" })} />
                <MoreAction label="חנות אפליקציות" icon={Grid2X2} onClick={() => openMarketplace(moreButtonRef.current || closeButtonRef.current!)} />
                <MoreAction label="הוספה למסך הבית" icon={Home} onClick={() => requestInstall(moreButtonRef.current || closeButtonRef.current!)} />
              </nav>
              <p className="mt-4 px-1 text-[11px] font-semibold leading-5 text-slate-500">אם הדפדפן מאפשר התקנה, ייפתח חלון אישור. אחרת יוצגו שלבים להוספה ידנית.</p>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
