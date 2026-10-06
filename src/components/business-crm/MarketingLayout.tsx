import type { ReactNode } from "react";
import { VETERINARY_CLINIC_PROFILE, clinicDisplayLabel } from "@/lib/clinicProfile";

export type MarketingView = "automatic" | "broadcasts" | "sent" | "reports";

const titles: Record<MarketingView, { title: string; subtitle: string }> = {
  automatic: { title: "קמפיינים אוטומטיים", subtitle: "הגדירו מסרים שיתחילו מאירוע מתאים, בלי לדמות שליחה או תוצאות שעדיין לא קיימות." },
  broadcasts: { title: "הודעות שיווקיות", subtitle: "הודעות אימייל ו-SMS חד-פעמיות, עם קהל ותוכן שתוכלו לאשר לפני שליחה." },
  sent: { title: "קמפיינים והודעות שנשלחו", subtitle: "יומן שליחות מאוחד שיוצג לאחר חיבור שליחה אמיתי ורישום אירועי מסירה." },
  reports: { title: 'דו"חות', subtitle: "סיכום שליחות אמיתיות ונתונים שניתן לקשר אליהן, בלי לנחש המרות." },
};

interface Props {
  view: MarketingView;
  children: ReactNode;
}

export function MarketingLayout({ view, children }: Props) {
  const copy = titles[view];
  return (
    <div dir="rtl" className="w-full text-[#1A1A3E]">
      <div className="mb-7 max-w-3xl">
        <p className="mb-2 text-xs font-extrabold tracking-wide text-slate-500">{clinicDisplayLabel(VETERINARY_CLINIC_PROFILE)}</p>
        <h1 className="text-3xl font-black tracking-tight text-[#1A1A3E] sm:text-4xl">{copy.title}</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">{copy.subtitle}</p>
      </div>
      {children}
    </div>
  );
}
