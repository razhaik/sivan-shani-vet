import { AlertTriangle, CheckCircle2, GitMerge, Info, SkipForward, UserPlus } from "lucide-react";
import type { ImportDecision, ImportReviewRow } from "@/lib/clientImportExport";

interface ClientImportReviewProps {
  rows: ImportReviewRow[];
  decisions: Record<number, ImportDecision>;
  onDecision: (rowIndex: number, decision: ImportDecision) => void;
}

function value(text: string) {
  return text || "לא צוין";
}

function actionLabel(action: ImportDecision["action"]) {
  if (action === "merge") return "איחוד עם הלקוח";
  if (action === "new") return "ייבוא כלקוח חדש";
  if (action === "skip") return "דילוג על השורה";
  return "נדרשת בחירה";
}

function matchLabel(match: ImportReviewRow["matches"][number]) {
  const origin = match.kind === "file"
    ? `שורה ${match.sourceRow} בקובץ`
    : match.isImported
      ? "לקוח מיובא"
      : "לקוח קיים";
  const reasons = match.reasons.length ? ` · ${match.reasons.join(" · ")}` : "";
  return `${match.certainty === "certain" ? "כפילות ודאית" : "התאמה אפשרית"}${reasons} · ${origin}`;
}

function Detail({ label, text, direction = "rtl" }: { label: string; text: string; direction?: "ltr" | "rtl" | "auto" }) {
  return (
    <p className="min-w-0">
      <span className="font-extrabold text-slate-400">{label}: </span>
      <b dir={direction} className="font-bold text-[#1A1A3E]">{value(text)}</b>
    </p>
  );
}

function AdditionalFieldsPreview({ fields }: { fields: ImportReviewRow["values"]["additionalFields"] }) {
  if (!fields.length) return null;
  const visibleFields = fields.slice(0, 3);

  return (
    <div className="mt-3 rounded-xl border border-[#E2DDF8] bg-[#FBFAFF] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black text-[#5744A4]">פרטים נוספים שנשמרו</p>
        <span className="rounded-full bg-[#EEEAFE] px-2 py-0.5 text-[10px] font-black text-[#5744A4]">
          {fields.length} ערכים
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {visibleFields.map((field, index) => (
          <p key={`${field.key}-${index}`} className="flex min-w-0 items-baseline gap-1 text-[11px] leading-5">
            <b className="shrink-0 text-[#1A1A3E]">{field.label}:</b>
            <span dir="auto" title={field.value} className="min-w-0 truncate text-slate-600">{field.value}</span>
          </p>
        ))}
      </div>
      {fields.length > visibleFields.length && (
        <p className="mt-1.5 text-[10px] font-black text-[#5744A4]">
          + עוד {fields.length - visibleFields.length} ערכים יישמרו בפרטי הלקוח
        </p>
      )}
    </div>
  );
}

function ImportRowCard({
  row,
  decision,
  onDecision,
}: {
  row: ImportReviewRow;
  decision: ImportDecision;
  onDecision: (decision: ImportDecision) => void;
}) {
  const selectedTarget = row.matches.find((match) => match.targetKey === decision.targetKey);
  const automaticMergeSuggested = row.defaultDecision.action === "merge";
  const automaticMergeActive = automaticMergeSuggested
    && decision.action === "merge"
    && decision.targetKey === row.defaultDecision.targetKey;
  const automaticMergeOverridden = automaticMergeSuggested && !automaticMergeActive;
  const hasCertainMatch = row.matches.some((match) => match.certainty === "certain");
  const nameOnlyMatch = row.matches.length > 0 && !hasCertainMatch;
  const automaticNewSuggested = nameOnlyMatch && row.defaultDecision.action === "new";
  const automaticNewActive = automaticNewSuggested && decision.action === "new";
  const automaticNewOverridden = automaticNewSuggested && !automaticNewActive;
  const address = [
    row.values.address,
    row.values.city,
    row.values.postalCode ? `מיקוד ${row.values.postalCode}` : "",
  ].filter(Boolean).join(" · ");
  const pet = [row.values.petName, row.values.petSpecies === "dog" ? "כלב" : row.values.petSpecies === "cat" ? "חתול" : row.values.petSpecies === "other" ? "אחר" : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold text-slate-400">שורה {row.sourceRow} בקובץ</p>
          <h3 className="mt-1 text-sm font-black text-[#1A1A3E]">{value(row.values.name)}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
          hasCertainMatch
            ? "bg-[#FFF4CF] text-[#69550C]"
            : row.matches.length
              ? "bg-[#F3F0FF] text-[#5744A4]"
              : "bg-[#E8F2EA] text-[#2C6A3B]"
        }`}>
          {hasCertainMatch
            ? `${row.matches.length} התאמות, כולל כפילות ודאית`
            : row.matches.length
              ? `${row.matches.length} התאמות אפשריות`
              : "לא נמצאה התאמה"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-extrabold text-slate-600">
        <span className="rounded-full bg-[#F7F8FB] px-2.5 py-1">{row.groupedRowCount} שורות מקור בקבוצת הבעלים</span>
        <span className="rounded-full bg-[#FFF9E8] px-2.5 py-1 text-[#806A16]">{row.groupedPetCount} חיות מחמד בקבוצה</span>
        <span className="rounded-full bg-[#EEEAFE] px-2.5 py-1 text-[#5744A4]">{row.values.additionalFields.length} פרטים נוספים</span>
        {row.groupedRowCount > 1 && (
          <span className="rounded-full bg-[#FBFCFD] px-2.5 py-1 text-slate-500">
            שורות {row.groupedSourceRows.slice(0, 6).join(", ")}{row.groupedSourceRows.length > 6 ? " ועוד" : ""}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-x-4 gap-y-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="תעודת זהות" text={row.values.nationalId} direction="ltr" />
        <Detail label="טלפון סלולרי" text={row.values.mobilePhone} direction="ltr" />
        <Detail label="טלפון בבית" text={row.values.homePhone || row.values.phone} direction="ltr" />
        <Detail label="אימייל" text={row.values.email} direction="ltr" />
        <Detail label="כתובת, עיר ומיקוד" text={address} direction="auto" />
        <Detail label="חיית מחמד" text={pet} />
      </div>

      <AdditionalFieldsPreview fields={row.values.additionalFields} />

      {row.errors.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2 text-[11px] font-semibold leading-5 text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {row.errors.join(" · ")}
        </p>
      )}
      {row.warnings.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFFBEA] px-3 py-2 text-[11px] font-semibold leading-5 text-[#69550C]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {row.warnings.join(" · ")}
        </p>
      )}

      {decision.action === "merge" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#DCE6DF] bg-[#F4FAF5] px-3 py-2.5 text-[11px] leading-5 text-[#2C6A3B]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <b className="block font-black">מה יקרה אם תאשרי איחוד?</b>
            <span>שדות ריקים יתמלאו מהקובץ, מידע קיים ולא ריק יישאר כפי שהוא, הערות יאוחדו בלי כפילויות, וחיות מחמד חדשות יתווספו בלי למחוק חיות קיימות.</span>
          </div>
        </div>
      )}

      {automaticMergeActive && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#EEF8F0] px-3 py-2 text-[11px] font-extrabold leading-5 text-[#2C6A3B]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          איחוד מסומן מראש לפי טלפון, אימייל או תעודת זהות זהים. אפשר לשנות את הבחירה.
        </p>
      )}
      {automaticMergeOverridden && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#F7F7F7] px-3 py-2 text-[11px] font-bold leading-5 text-slate-600">
          <Info className="h-3.5 w-3.5 shrink-0" />
          הוצע איחוד אוטומטי, והבחירה עודכנה לבחירתך.
        </p>
      )}
      {automaticNewActive && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#EEF8F0] px-3 py-2 text-[11px] font-extrabold leading-5 text-[#2C6A3B]">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          נמצאה התאמה לפי שם בלבד, לכן ייבוא כלקוח חדש מסומן מראש. שם זהה אינו כפילות ודאית, ואפשר לשנות את הבחירה.
        </p>
      )}
      {automaticNewOverridden && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[#F7F7F7] px-3 py-2 text-[11px] font-bold leading-5 text-slate-600">
          <Info className="h-3.5 w-3.5 shrink-0" />
          ברירת המחדל הייתה ייבוא כלקוח חדש לפי שם בלבד, והבחירה עודכנה לבחירתך.
        </p>
      )}

      {row.matches.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#F2D162]/60 bg-[#FFFDF2] p-3">
          <div className="flex items-start gap-2 text-xs font-black text-[#1A1A3E]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B28B00]" />
            <span>
              {automaticMergeActive
                ? "זה היעד שנבחר לאיחוד. אפשר לבחור יעד אחר או לייבא כלקוח חדש."
                : hasCertainMatch
                  ? "כפילות לפי טלפון, אימייל או תעודת זהות. בחרי יעד או שנה את הפעולה."
                  : "התאמה אפשרית לפי שם בלבד. כברירת מחדל השורה תיובא כלקוח חדש. אפשר לבחור פעולה אחרת אם יש לך מידע נוסף."}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {row.matches.map((match) => (
              <label
                key={match.targetKey}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-xs transition ${
                  selectedTarget?.targetKey === match.targetKey
                    ? "border-[#1A1A3E] bg-white"
                    : "border-[#E8E1BB] bg-white/60 hover:border-[#D3B63B]"
                }`}
              >
                <input
                  type="radio"
                  name={`target-${row.rowIndex}`}
                  checked={decision.targetKey === match.targetKey}
                  onChange={() => onDecision({ ...decision, targetKey: match.targetKey })}
                  className="mt-0.5 h-4 w-4 accent-[#1A1A3E]"
                  aria-label={`בחירת יעד ${match.name || "לקוח ללא שם"}`}
                />
                <span className="min-w-0 flex-1">
                  <b className="block text-[#1A1A3E]">{match.name || "לקוח ללא שם"}</b>
                  <span className="mt-1 block leading-5 text-slate-500">{matchLabel(match)}</span>
                  {(match.nationalId || match.phone || match.email) && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
                      {match.nationalId && <span dir="ltr">ת״ז: {match.nationalId}</span>}
                      {match.phone && <span dir="ltr">טלפון: {match.phone}</span>}
                      {match.email && <span dir="ltr">{match.email}</span>}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={!decision.targetKey}
          onClick={() => onDecision({ ...decision, action: "merge" })}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50 ${
            decision.action === "merge"
              ? "border-[#1A1A3E] bg-[#1A1A3E] text-white"
              : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"
          }`}
        >
          <GitMerge className="h-4 w-4" />
          איחוד עם הלקוח
        </button>
        <button
          type="button"
          onClick={() => onDecision({ ...decision, action: "new" })}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${
            decision.action === "new"
              ? "border-[#1A1A3E] bg-[#1A1A3E] text-white"
              : "border-[#D9DEE5] bg-white text-[#1A1A3E] hover:border-[#F2D162]"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          ייבוא כלקוח חדש
        </button>
        <button
          type="button"
          onClick={() => onDecision({ ...decision, action: "skip" })}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162] ${
            decision.action === "skip"
              ? "border-slate-500 bg-slate-100 text-slate-700"
              : "border-[#D9DEE5] bg-white text-slate-600 hover:border-slate-400"
          }`}
        >
          <SkipForward className="h-4 w-4" />
          דילוג על השורה
        </button>
      </div>

      <p className={`mt-3 flex items-center gap-1 text-[11px] font-bold ${
        decision.action === "pending" ? "text-[#B45309]" : "text-slate-400"
      }`}>
        {decision.action === "pending"
          ? <AlertTriangle className="h-3.5 w-3.5" />
          : <CheckCircle2 className="h-3.5 w-3.5 text-[#2C6A3B]" />}
        {actionLabel(decision.action)}
      </p>
    </article>
  );
}

export function ClientImportReview({ rows, decisions, onDecision }: ClientImportReviewProps) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-5 py-10 text-center">
        <p className="text-sm font-black text-[#1A1A3E]">אין שורות תקינות לסקירה</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">תקני את המיפוי או בדקי את הקובץ לפני שממשיכים.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ImportRowCard
          key={row.rowIndex}
          row={row}
          decision={decisions[row.rowIndex] || row.defaultDecision}
          onDecision={(decision) => onDecision(row.rowIndex, decision)}
        />
      ))}
    </div>
  );
}
