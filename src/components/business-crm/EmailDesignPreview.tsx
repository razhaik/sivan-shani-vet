import { useState } from "react";
import { Mail, Monitor, Smartphone } from "lucide-react";
import { CLINIC_EMAIL_LOGO_URL } from "@/lib/emailTemplates";
import { VETERINARY_CLINIC_PROFILE } from "@/lib/clinicProfile";

const FALLBACK_SUBJECT = "עדכון חשוב מהמרפאה";
const FALLBACK_BODY = "שלום,\n\nרצינו לשתף אתכם בעדכון קצר מהמרפאה. צוות המרפאה כאן עבורכם ועבור חיות המחמד שלכם, עם טיפול מקצועי, יחס אישי ותיאום נוח.";
const FALLBACK_CTA_LABEL = "קביעת תור";
const FALLBACK_CTA_URL = "/appointments";

type PreviewMode = "desktop" | "mobile";

export interface EmailDesignPreviewProps {
  subject?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  broadcastName?: string;
}

function cleanText(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

function destinationLabel(url: string) {
  if (url.startsWith("tel:")) return "טלפון המרפאה";
  if (url.startsWith("http")) return "קישור חיצוני";
  return url;
}

export function EmailDesignPreview({ subject, body, ctaLabel, ctaUrl, broadcastName }: EmailDesignPreviewProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const cleanSubject = cleanText(subject);
  const cleanBody = cleanText(body);
  const cleanCtaLabel = cleanText(ctaLabel);
  const cleanCtaUrl = cleanText(ctaUrl);
  const isFallback = !cleanSubject && !cleanBody && !cleanCtaLabel && !cleanCtaUrl;
  const displaySubject = cleanSubject || FALLBACK_SUBJECT;
  const displayBody = cleanBody || FALLBACK_BODY;
  const showCta = isFallback ? true : Boolean(cleanCtaLabel && cleanCtaUrl);
  const displayCtaLabel = cleanCtaLabel || FALLBACK_CTA_LABEL;
  const displayCtaUrl = cleanCtaUrl || FALLBACK_CTA_URL;

  return (
    <aside dir="rtl" aria-label="תצוגת עיצוב של אימייל" className="rounded-2xl border border-[#D5E2E7] bg-[#F7FAFB] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-wide text-[#1D6472]">תצוגת אימייל</p>
          <p className="mt-1 text-[11px] font-semibold text-[#718792]">{cleanText(broadcastName) || "דוגמת הודעה למרפאה"}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F3F5] px-2.5 py-1 text-[10px] font-black text-[#1D6472]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2F90A1]" aria-hidden="true" />
          מתעדכנת בזמן אמת
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-[#526B77]">רוחב התצוגה</p>
        <div role="group" aria-label="בחירת רוחב תצוגת האימייל" className="inline-flex rounded-xl border border-[#D5E2E7] bg-white p-1 shadow-sm">
          {([
            ["desktop", "מחשב", Monitor],
            ["mobile", "נייד", Smartphone],
          ] as const).map(([value, label, Icon]) => {
            const selected = previewMode === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                aria-label={`תצוגת ${label}`}
                title={`תצוגת ${label}`}
                onClick={() => setPreviewMode(value)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition focus:outline-none focus:ring-2 focus:ring-[#2F90A1] focus:ring-offset-1 ${selected ? "bg-[#0F2842] text-white shadow-sm" : "text-[#526B77] hover:bg-[#EFF6F8]"}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-[#D5E2E7] bg-[#ECF5F7] p-2.5 sm:p-3">
        <div className={`mx-auto w-full transition-all duration-300 ${previewMode === "desktop" ? "max-w-[340px]" : "max-w-[238px]"}`}>
          <div className="relative isolate min-h-[500px] overflow-hidden rounded-[20px] border border-[#D4E2E7] bg-white shadow-lg">
            <img
              src={CLINIC_EMAIL_LOGO_URL}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[52%] z-0 h-[88%] w-[94%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.24] mix-blend-multiply"
            />

            <div className="relative z-10 flex min-h-[500px] flex-col">
              <header className="border-b border-[#DCE9EE] bg-[#F4F9FA]/95 px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-black tracking-tight text-[#0F2842]">{VETERINARY_CLINIC_PROFILE.shortName}</p>
                    <p className="mt-1 text-[10px] font-bold leading-4 text-[#52717D]">{VETERINARY_CLINIC_PROFILE.categoryLabel} · {VETERINARY_CLINIC_PROFILE.tagline}</p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#DCEFF2] text-[#1D6472]" aria-hidden="true">
                    <Mail className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-4 h-1 w-14 rounded-full bg-[#2F90A1]" aria-hidden="true" />
              </header>

              <main className="flex-1 px-5 py-7 sm:px-6">
                <p className="text-[10px] font-black tracking-[0.16em] text-[#2F90A1]">נושא ההודעה</p>
                <h2 className="mt-3 text-[19px] font-black leading-7 text-[#0F2842]">{displaySubject}</h2>
                <div className="mt-5 h-px bg-[#DCE9EE]" aria-hidden="true" />
                <p className="mt-5 whitespace-pre-wrap break-words text-[13px] font-semibold leading-7 text-[#405A67]">{displayBody}</p>

                {showCta && (
                  <div className="mt-7">
                    <span className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#1D6472] px-4 text-[12px] font-black text-white shadow-sm">
                      {displayCtaLabel}
                    </span>
                    <p className="mt-2 break-all text-[9px] font-semibold leading-4 text-[#7C929B]">
                      <span className="font-black text-[#526B77]">קישור:</span> <span dir="ltr">{destinationLabel(displayCtaUrl)}</span>
                    </p>
                  </div>
                )}
              </main>

              <footer className="border-t border-[#DCE9EE] bg-[#F8FBFC]/95 px-5 py-4 sm:px-6">
                <p className="text-[10px] font-black text-[#0F2842]">בברכה, {VETERINARY_CLINIC_PROFILE.shortName}</p>
                <p className="mt-1 text-[9px] font-semibold text-[#718792]">{VETERINARY_CLINIC_PROFILE.categoryLabel} · כאן עבורכם ועבור חיות המחמד שלכם</p>
              </footer>
            </div>
          </div>
        </div>
      </div>

      <div role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-[#C9DDE3] bg-[#F1F7F8] px-3 py-2.5 text-[11px] font-bold leading-5 text-[#466875]">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#D7EBEF] text-[10px] font-black text-[#1D6472]" aria-hidden="true">i</span>
        <p>תצוגת עיצוב בלבד · עדיין לא משפיעה על השליחה</p>
      </div>
    </aside>
  );
}
