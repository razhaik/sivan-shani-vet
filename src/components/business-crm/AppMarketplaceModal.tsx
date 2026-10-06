import { useEffect, useRef, useState, type LucideIcon } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Grid2X2,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  Tag,
  Video,
  X,
} from "lucide-react";

type ConnectionType = "personal" | "business";
type ConnectionStatus = "connected" | "available";
type MarketplaceTab = "about" | "pricing";

type MarketplaceApp = {
  id: string;
  name: string;
  mark: string;
  icon: LucideIcon;
  imageUrl?: string;
  shortDescription: string;
  description: string;
  connectionType: ConnectionType;
  connectionStatus: ConnectionStatus;
  features: string[];
  languages: string[];
  markClassName: string;
};

const marketplaceApps: MarketplaceApp[] = [
  {
    id: "google-calendar",
    name: "יומן Google",
    mark: "G",
    icon: CalendarDays,
    imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/c8a84049-ffd7-43c9-8bf2-e3c63f961337-pasted-image-1788959097800.png",
    shortDescription: "ריכוז פגישות וזמינות ביומן Google המחובר של המרפאה.",
    description: "יומן Google העסקי של המרפאה מחובר למערכת ומרכז את הזמינות והפגישות במקום אחד.",
    connectionType: "business",
    connectionStatus: "connected",
    features: ["סנכרון דו־כיווני של אירועים", "מניעת כפילות בזימונים", "תמונת זמינות מעודכנת לצוות"],
    languages: ["עברית", "אנגלית"],
    markClassName: "border-[#D9E5FF] bg-[#EEF4FF] text-[#4974D4]",
  },
  {
    id: "outlook-calendar",
    name: "יומן Outlook",
    mark: "O",
    icon: CalendarDays,
    imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/87c739e9-dd58-4bb3-9908-2ba53b13189f-pasted-image-1788959293421.png",
    shortDescription: "חיבור ליומן Microsoft עבור צוות שעובד ב-Outlook.",
    description: "חיבור עתידי ל-Outlook Calendar, שיאפשר לצוות לראות את פגישות העבודה והזמינות במקום אחד.",
    connectionType: "personal",
    connectionStatus: "available",
    features: ["סנכרון פגישות לשני הכיוונים", "שמירה על זמינות אישית מעודכנת", "ריכוז פרטי פגישה במקום אחד"],
    languages: ["עברית", "אנגלית"],
    markClassName: "border-[#CDE9F3] bg-[#EEF9FC] text-[#167B9A]",
  },
  {
    id: "zoom",
    name: "שיחות וידאו Zoom",
    mark: "Z",
    icon: Video,
    imageUrl: "https://ellprnxjjzatijdxcogk.supabase.co/storage/v1/object/public/superdev-project-images/a301af57-5ec1-4bdd-b507-48300a4b64bb/lczgvu3wjuxaqpny3stm/72e9753b-4cb7-4635-916b-44f14a7dd440-pasted-image-1788959384653.png",
    shortDescription: "הכנת קישור לשיחת וידאו מתוך פגישות מתאימות.",
    description: "חיבור עתידי ל-Zoom, שירכז את קישורי שיחות הווידאו ופרטי הפגישה בתוך סביבת העבודה.",
    connectionType: "business",
    connectionStatus: "available",
    features: ["יצירת קישור לשיחת וידאו מתוך פגישה", "שמירת פרטי השיחה לצד האירוע", "גישה מהירה לקישור עבור הצוות"],
    languages: ["עברית", "אנגלית"],
    markClassName: "border-[#D9D7FF] bg-[#F0EFFF] text-[#5B57B8]",
  },
];

interface AppMarketplaceModalProps {
  onClose: () => void;
  returnFocusRef?: { current: HTMLButtonElement | null };
}

function AppMark({ app, large = false }: { app: MarketplaceApp; large?: boolean }) {
  const Icon = app.icon;
  return (
    <div className={`relative flex shrink-0 items-center justify-center rounded-2xl border shadow-sm ${large ? "h-20 w-20" : "h-14 w-14"} ${app.markClassName}`} aria-hidden="true">
      {app.imageUrl ? (
        <img
          src={app.imageUrl}
          alt=""
          className={`object-contain ${large ? "h-14 w-14 rounded-2xl" : "h-10 w-10 rounded-xl"}`}
        />
      ) : (
        <>
          <Icon className={large ? "h-9 w-9" : "h-6 w-6"} strokeWidth={1.8} />
          <span className={`absolute bottom-1 left-1 rounded-md bg-white/80 px-1 font-black leading-4 ${large ? "text-[10px]" : "text-[9px]"}`}>{app.mark}</span>
        </>
      )}
    </div>
  );
}

function MarketplaceHero() {
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-[#1A1A3E] px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8" aria-label="היכרות עם חנות האפליקציות">
      <div className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-[#F2D162]/[0.18] blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-24 right-10 h-48 w-48 rounded-full bg-[#5267A8]/[0.35] blur-3xl" aria-hidden="true" />
      <div className="relative grid items-center gap-7 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-3 py-1.5 text-[11px] font-extrabold text-[#F8E9A7]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>מרכז האינטגרציות של המרפאה</span>
          </div>
          <h2 className="max-w-xl text-2xl font-black leading-tight tracking-tight sm:text-3xl">כל האפליקציות לייעול יום העבודה שלך</h2>
          <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-white/75">בחרי חיבור כדי להכיר את הדרך שבה הוא יוכל להשתלב בעבודה היומיומית. יומן Google של המרפאה כבר מחובר, וחיבורים חדשים יופעלו בהמשך.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold text-white/75">
            <span className="rounded-lg bg-white/[0.1] px-2.5 py-1.5">3 אפליקציות זמינות לעיון</span>
            <span className="rounded-lg bg-white/[0.1] px-2.5 py-1.5">יומן Google כבר מחובר</span>
          </div>
        </div>
        <div className="relative mx-auto h-44 w-full max-w-[330px]" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[30px] border border-white/20 bg-white/[0.12] shadow-2xl backdrop-blur-sm">
            <Grid2X2 className="h-14 w-14 text-[#F2D162]" strokeWidth={1.4} />
          </div>
          <div className="absolute right-2 top-2 flex items-center gap-2 rounded-2xl border border-white/[0.15] bg-white/[0.12] px-3 py-2 text-xs font-extrabold shadow-lg backdrop-blur-sm"><CalendarDays className="h-4 w-4 text-[#B8D3FF]" />יומנים</div>
          <div className="absolute bottom-1 left-0 flex items-center gap-2 rounded-2xl border border-white/[0.15] bg-white/[0.12] px-3 py-2 text-xs font-extrabold shadow-lg backdrop-blur-sm"><Video className="h-4 w-4 text-[#D1CFFF]" />שיחות וידאו</div>
          <div className="absolute bottom-5 right-7 h-2.5 w-2.5 rounded-full bg-[#F2D162] shadow-[0_0_0_6px_rgba(242,209,98,0.12)]" />
        </div>
      </div>
    </section>
  );
}

function MarketplaceCard({ app, onOpen }: { app: MarketplaceApp; onOpen: () => void }) {
  const isOutlook = app.id === "outlook-calendar";
  const isZoom = app.id === "zoom";
  return (
    <article className="group flex min-h-[245px] flex-col rounded-2xl border border-[#E6E8ED] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#D8C46A] hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <AppMark app={app} />
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${app.connectionStatus === "connected" ? "bg-[#EAF6EC] text-[#3F7B49]" : "bg-[#F7F7F9] text-slate-500"}`}>{app.connectionStatus === "connected" ? "מחובר" : "זמין לעיון"}</span>
      </div>
      <h3 className="mt-5 text-base font-black text-[#1A1A3E]">{app.name}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{app.shortDescription}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <span className={`text-[11px] font-bold ${app.connectionStatus === "connected" ? "text-[#3F7B49]" : isOutlook ? "text-[#167B9A]" : isZoom ? "text-[#5B57B8]" : "text-slate-400"}`}>{app.connectionStatus === "connected" ? "החיבור הקיים פעיל" : isOutlook || isZoom ? "אפשרות לחיבור בהמשך" : "קטלוג בלבד בשלב זה"}</span>
        <button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#1A1A3E] px-3.5 text-xs font-black text-white transition hover:bg-[#2B2B5B] focus:outline-none focus:ring-2 focus:ring-[#F2D162] focus:ring-offset-2" aria-label={`צפייה בפרטי ${app.name}`}>
          זמין<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function ComingSoonCard() {
  return (
    <article className="relative flex min-h-[245px] flex-col overflow-hidden rounded-2xl border border-dashed border-[#D7D9E2] bg-[#FBFBFC] p-5 text-right" aria-label="אפליקציות נוספות יגיעו בקרוב">
      <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#F2D162]/[0.22]" aria-hidden="true" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E5E1BF] bg-[#FFFBEA] text-[#A18212]" aria-hidden="true"><Grid2X2 className="h-6 w-6" /></div>
      <span className="relative mt-5 text-base font-black text-[#1A1A3E]">אפליקציות נוספות בדרך</span>
      <p className="relative mt-2 max-w-[220px] text-sm font-medium leading-6 text-slate-500">אפליקציות נוספות יגיעו ממש בקרוב. נרחיב את האפשרויות לפי הצרכים של העסק.</p>
      <span className="relative mt-auto pt-5 text-xs font-extrabold text-[#A18212]">בקרוב</span>
    </article>
  );
}

function DetailView({ app, activeTab, installNotice, onBack, onTabChange, onInstall }: { app: MarketplaceApp; activeTab: MarketplaceTab; installNotice: string; onBack: () => void; onTabChange: (tab: MarketplaceTab) => void; onInstall: () => void }) {
  const isConnected = app.connectionStatus === "connected";
  const isOutlook = app.id === "outlook-calendar";
  const isZoom = app.id === "zoom";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="פירורי לחם" className="min-w-0 text-xs font-bold text-slate-400">
          <ol className="flex items-center gap-2">
            <li><button type="button" onClick={onBack} className="transition hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">חנות אפליקציות</button></li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-[#1A1A3E]" aria-current="page">{app.name}</li>
          </ol>
        </nav>
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#DCE0E7] bg-white px-3.5 text-xs font-extrabold text-[#1A1A3E] transition hover:border-[#F2D162] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"><ArrowRight className="h-4 w-4" aria-hidden="true" />חזרה לקטלוג</button>
      </div>

      <section className="mt-5 rounded-[26px] border border-[#E6E8ED] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <AppMark app={app} large />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold">
              <span className="rounded-full bg-[#F7F7F9] px-2.5 py-1 text-slate-500">{app.connectionType === "personal" ? "חיבור אישי לצוות" : app.id === "google-calendar" ? "חיבור עסקי" : "חיבור לעסק"}</span>
              <span className={`rounded-full px-2.5 py-1 ${isConnected ? "bg-[#EAF6EC] text-[#3F7B49]" : "bg-[#FFFBEA] text-[#9A7A0B]"}`}>{isConnected ? "החיבור הקיים פעיל" : "קטלוג בלבד"}</span>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#1A1A3E]">{app.name}</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">{app.description}</p>
          </div>
          <div className="w-full shrink-0 lg:w-[220px]">
            <button type="button" disabled={isConnected} onClick={isConnected ? undefined : onInstall} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${isConnected ? "cursor-default border border-[#CDE8D1] bg-[#EEF8F0] text-[#3F7B49]" : "bg-[#F2D162] text-[#1A1A3E] hover:bg-[#E8C84A] focus:ring-[#1A1A3E]/30"}`}>{isConnected ? <Check className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}{isConnected ? "מחובר ליומן Google" : isOutlook ? "חבר את Outlook" : isZoom ? "חבר את Zoom" : "להתקנת האפליקציה"}</button>
            <p role="status" aria-live="polite" className="mt-2 text-center text-[11px] font-semibold leading-5 text-slate-400">{isConnected ? "יומן Google העסקי כבר מחובר. אין צורך בהתקנה או בחיבור נוסף." : installNotice || "החיבור המאובטח יופעל בשלב הבא. כרגע אין שינוי או חיוב."}</p>
          </div>
        </div>
      </section>

      {app.connectionType === "personal" && <div className="mt-4 flex gap-3 rounded-2xl border border-[#F0D58C] bg-[#FFF8DF] p-4 text-right"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#A47700]" aria-hidden="true" /><div><h3 className="text-sm font-black text-[#6D5100]">חיבור אישי לכל איש צוות</h3><p className="mt-1 text-xs font-semibold leading-5 text-[#826A22]">האפליקציה תדרוש מכל איש צוות להתחבר לחשבון האישי שלו בנפרד. החיבור עדיין אינו פעיל.</p></div></div>}

      <div className="mt-6 border-b border-[#E6E8ED]" role="tablist" aria-label={`מידע על ${app.name}`}>
        <div className="flex gap-5">
          {(["about", "pricing"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`marketplace-${tab}-${app.id}`} onClick={() => onTabChange(tab)} className={`relative min-h-12 px-1 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${activeTab === tab ? "text-[#1A1A3E]" : "text-slate-400 hover:text-[#1A1A3E]"}`}>{tab === "about" ? "אודות" : "מחיר"}{activeTab === tab && <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full bg-[#F2D162]" />}</button>)}
        </div>
      </div>

      {activeTab === "about" ? <div id={`marketplace-about-${app.id}`} role="tabpanel" aria-label="אודות" className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_245px]">
        <section className="rounded-2xl border border-[#E6E8ED] bg-white p-5"><h3 className="text-base font-black text-[#1A1A3E]">מאפיינים</h3><p className="mt-1 text-xs font-medium text-slate-400">{isConnected ? "מה החיבור מאפשר לצוות המרפאה." : "מה החיבור מיועד לאפשר לאחר הפעלתו."}</p><ul className="mt-4 space-y-3">{app.features.map((feature) => <li key={feature} className="flex items-start gap-3 text-sm font-bold leading-6 text-slate-600"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEF6EE] text-[#4F8A58]"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>{feature}</li>)}</ul></section>
        <aside className="rounded-2xl border border-[#E6E8ED] bg-[#FBFBFC] p-5"><h3 className="text-sm font-black text-[#1A1A3E]">זמין בשפות הבאות</h3><div className="mt-3 flex flex-wrap gap-2">{app.languages.map((language) => <span key={language} className="rounded-lg border border-[#E3E5EA] bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600">{language}</span>)}</div><div className="mt-6 space-y-2 border-t border-[#E6E8ED] pt-4"><div className="flex items-start gap-2 text-xs font-bold text-slate-400"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" /><span>שירות לקוחות<small className="mt-0.5 block font-semibold text-slate-400">{isConnected ? "החיבור העסקי כבר פעיל" : "יהיה זמין עם הפעלת החיבור"}</small></span></div><div className="flex items-start gap-2 text-xs font-bold text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>מדיניות פרטיות<small className="mt-0.5 block font-semibold text-slate-400">{isConnected ? "מדובר בחיבור עסקי קיים" : "הקישור יתווסף לפני חיבור אמיתי"}</small></span></div></div></aside>
      </div> : <div id={`marketplace-pricing-${app.id}`} role="tabpanel" aria-label="מחיר" className="py-6"><section className="rounded-2xl border border-[#E6E8ED] bg-white p-6 sm:p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFFBEA] text-[#A18212]"><Tag className="h-6 w-6" /></div><h3 className="mt-5 text-xl font-black text-[#1A1A3E]">{isConnected ? "החיבור העסקי כבר פעיל" : "המחיר יוצג לפני הפעלת החיבור"}</h3><p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">{isConnected ? "יומן Google העסקי מחובר למרפאה, ולכן אין צורך בהתקנה נוספת מהחנות." : "החנות מציגה כרגע קטלוג לעיון בלבד. לפני חיבור אמיתי יוצגו מודל התמחור, תנאי השימוש וכל פרט שחשוב לדעת."}</p><div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-[#F7F7F9] px-4 py-3 text-sm"><span className="font-bold text-slate-500">מצב נוכחי:</span><strong className="text-[#1A1A3E]">{isConnected ? "מחובר, ללא התקנה נוספת" : "עיון בלבד, ללא חיוב"}</strong></div><div className="mt-4 flex gap-2 text-xs font-semibold leading-5 text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{isConnected ? "אין צורך בהתקנה, התחברות או פעולה נוספת מהמסך הזה." : "לא תתבצע התקנה, התחברות או גבייה מהמסך הזה."}</div></section></div>}
    </div>
  );
}

export default function AppMarketplaceModal({ onClose, returnFocusRef }: AppMarketplaceModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedApp, setSelectedApp] = useState<MarketplaceApp | null>(null);
  const [activeTab, setActiveTab] = useState<MarketplaceTab>("about");
  const [installNotice, setInstallNotice] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = closeButtonRef.current?.closest("[role=\"dialog\"]");
      const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => {
        const trigger = returnFocusRef?.current;
        if (trigger?.isConnected) trigger.focus();
        else document.querySelector<HTMLButtonElement>('button[aria-label="פתיחת תפריט ניווט"]')?.focus();
      });
    };
  }, [onClose, returnFocusRef]);

  const openApp = (app: MarketplaceApp) => { setSelectedApp(app); setActiveTab("about"); setInstallNotice(""); };
  const goBack = () => { setSelectedApp(null); setActiveTab("about"); setInstallNotice(""); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#10102B]/[0.68] p-0 backdrop-blur-[3px] sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-marketplace-title" dir="rtl" className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#F8F9FB] shadow-2xl sm:h-[calc(100dvh-2rem)] sm:max-h-[860px] sm:max-w-[1000px] sm:rounded-[28px]">
        <header className="sticky top-0 z-10 flex min-h-[76px] shrink-0 items-center justify-between gap-4 border-b border-[#E7E8EC] bg-white/95 px-5 backdrop-blur-md sm:px-7">
          <div className="min-w-0"><h1 id="app-marketplace-title" className="truncate text-lg font-black text-[#1A1A3E]">חנות אפליקציות</h1><p className="mt-0.5 text-[11px] font-semibold text-slate-400">חיבורים שיעזרו לצוות לעבוד במקום אחד</p></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-xl p-2.5 text-slate-400 transition hover:bg-[#F3F4F6] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]" aria-label="סגירת חנות האפליקציות"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">{selectedApp ? <DetailView app={selectedApp} activeTab={activeTab} installNotice={installNotice} onBack={goBack} onTabChange={setActiveTab} onInstall={() => setInstallNotice(selectedApp?.id === "outlook-calendar" ? "החיבור עדיין לא הופעל. אפשר יהיה לחבר את Outlook בהמשך." : selectedApp?.id === "zoom" ? "החיבור עדיין לא הופעל. אפשר יהיה לחבר את Zoom בהמשך." : "החיבור המאובטח עדיין לא פעיל. אפשר לעיין בפרטים, וההתקנה תתווסף בשלב הבא.")} /> : <><MarketplaceHero /><section className="mt-7" aria-labelledby="available-apps-title"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 id="available-apps-title" className="text-xl font-black text-[#1A1A3E]">אפליקציות זמינות</h2><p className="mt-1 text-xs font-medium text-slate-400">עייני בפרטים ובאופן שבו כל חיבור יכול להשתלב בעבודה.</p></div><span className="hidden rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-500 shadow-sm sm:inline-flex">קטלוג שלב 1</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{marketplaceApps.map((app) => <MarketplaceCard key={app.id} app={app} onOpen={() => openApp(app)} />)}<ComingSoonCard /></div></section></>}</div>
      </section>
    </div>
  );
}
