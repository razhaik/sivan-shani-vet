import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { ClientExportOptions } from "@/components/business-crm/ClientExportOptions";
import { ClientImportReview } from "@/components/business-crm/ClientImportReview";
import {
  areImportDecisionsResolvable,
  findDuplicateMatches,
  importFieldLabels,
  importFields,
  mapImportRows,
  parseClientImportFile,
  summarizeImportRows,
  type ImportDecision,
  type ImportField,
  type ImportMapping,
  type ImportPlanEntry,
  type ImportReviewRow,
  type ImportRowsSummary,
  type ParsedImportFile,
} from "@/lib/clientImportExport";
import type { ImportSaveProgress, ImportSaveProgressCallback, ImportSaveResult } from "@/lib/clientImportPersistence";
import type { ClientRow } from "@/lib/crmClientData";

export type ImportExportMode = "import" | "export";

interface ClientImportExportModalProps {
  open: boolean;
  mode: ImportExportMode;
  existingRows: ClientRow[];
  exportRows: ClientRow[];
  exportScopeLabel: string;
  onClose: () => void;
  onImport: (plan: ImportPlanEntry[], onProgress?: ImportSaveProgressCallback) => Promise<ImportSaveResult>;
}

type ImportStep = "file" | "mapping" | "review" | "summary" | "saving" | "success";
type MappedImportRow = ReturnType<typeof mapImportRows>[number];

function decisionForRow(
  row: ImportReviewRow,
  decisions: Record<number, ImportDecision>,
): ImportDecision {
  return decisions[row.rowIndex] || row.defaultDecision;
}

function initialDecisions(rows: ImportReviewRow[]): Record<number, ImportDecision> {
  return Object.fromEntries(
    rows.map((row) => [row.rowIndex, row.defaultDecision]),
  ) as Record<number, ImportDecision>;
}

function actionCount(
  rows: ImportReviewRow[],
  decisions: Record<number, ImportDecision>,
  action: ImportDecision["action"],
) {
  return rows.filter((row) => decisionForRow(row, decisions).action === action).length;
}

function ImportHeader({
  step,
  parsed,
  mode,
  onBack,
  onClose,
}: {
  step: ImportStep;
  parsed: ParsedImportFile | null;
  mode: ImportExportMode;
  onBack: () => void;
  onClose: () => void;
}) {
  const labels: Record<ImportStep, string> = {
    file: "בחירת קובץ",
    mapping: "מיפוי ותצוגה מקדימה",
    review: "בדיקת כפילויות",
    summary: "אישור לפני שמירה",
    saving: "שמירת לקוחות",
    success: "הייבוא הושלם",
  };
  const exportMode = mode === "export";

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#EEF0F3] pb-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A1A3E] text-[#F2D162]">
          <FileUp className="h-5 w-5" />
        </div>
        <div>
          <h2 id="client-import-title" className="text-lg font-black text-[#1A1A3E]">
            {exportMode ? "ייצוא לקוחות" : "ייבוא לקוחות"}
          </h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {exportMode ? "בחירת עמודות וסוג קובץ" : labels[step]}
            {parsed ? ` · ${parsed.fileName}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={step === "file" || step === "success" || step === "saving" || exportMode}
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-xs font-extrabold text-[#5267A8] hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:invisible"
        >
          חזרה
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={step === "saving"}
          className="rounded-xl p-2 text-slate-400 hover:bg-[#F7F7F7] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={exportMode ? "סגירת חלון הייצוא" : "סגירת חלון הייבוא"}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function FileStep({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="py-8 text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mx-auto flex min-h-36 w-full max-w-md flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-5 transition hover:border-[#F2D162] hover:bg-[#FFFDF2] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"
      >
        <FileUp className="h-8 w-8 text-[#5267A8]" />
        <span className="mt-3 text-sm font-black text-[#1A1A3E]">
          בחירת קובץ CSV או Excel
        </span>
        <span className="mt-1 text-xs font-medium text-slate-500">
          אפשר להעלות CSV, XLS או XLSX. הקובץ נקרא בתוך הדפדפן.
        </span>
        <span className="mt-2 text-xs font-extrabold text-[#5267A8]">
          קובצי CSV עם עברית נתמכים, כולל קבצים שנשמרו מאקסל.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <p className="mx-auto mt-5 max-w-md text-[11px] font-medium leading-5 text-slate-400">
        לפני שמירה תראי את השורות, תמפי כותרות לא מוכרות ותבדקי את ההתאמות. כפילויות ודאיות לפי טלפון, אימייל או תעודת זהות יסומנו מראש לאיחוד. התאמות לפי שם בלבד ייובאו כלקוחות חדשים כברירת מחדל, ואפשר לשנות את הפעולה אם יש לך מידע נוסף.
      </p>
    </div>
  );
}

function ImportSummaryStrip({
  summary,
  compact = false,
}: {
  summary: ImportRowsSummary;
  compact?: boolean;
}) {
  const metrics = [
    { value: summary.rows, label: "שורות בקובץ", className: "bg-[#F7F8FB] text-[#1A1A3E]" },
    { value: summary.validRows, label: "שורות תקינות", className: "bg-[#E8F2EA] text-[#2C6A3B]" },
    { value: summary.invalidRows, label: "שורות לא תקינות", className: "bg-[#FFF2F2] text-[#A33A3A]" },
    { value: summary.groupedOwners, label: "בעלים עם כמה שורות", className: "bg-[#FFF4CF] text-[#69550C]" },
    { value: summary.groupedRows, label: "שורות בקבוצות", className: "bg-[#FFF9E8] text-[#806A16]" },
    { value: summary.extraColumns, label: "עמודות נוספות", className: "bg-[#EEEAFE] text-[#5744A4]" },
    { value: summary.extraValues, label: "ערכים נוספים", className: "bg-[#F3F0FF] text-[#5744A4]" },
  ];

  return (
    <div
      className={`grid ${compact ? "grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7" : "grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"}`}
      aria-label="סיכום נתוני הייבוא"
    >
      {metrics.map((metric) => (
        <div key={metric.label} className={`rounded-xl px-2.5 py-2 text-center ${metric.className}`}>
          <b className="block text-base font-black leading-5">{metric.value.toLocaleString("he-IL")}</b>
          <span className="mt-0.5 block text-[10px] font-extrabold leading-4">{metric.label}</span>
        </div>
      ))}
    </div>
  );
}

function petSpeciesLabel(species: MappedImportRow["values"]["petSpecies"]) {
  if (species === "dog") return "כלב";
  if (species === "cat") return "חתול";
  if (species === "other") return "אחר";
  return "";
}

function MappingStep({
  parsed,
  mapping,
  rows,
  summary,
  invalidRows,
  onMapping,
  onReview,
}: {
  parsed: ParsedImportFile;
  mapping: ImportMapping;
  rows: MappedImportRow[];
  summary: ImportRowsSummary;
  invalidRows: MappedImportRow[];
  onMapping: (field: ImportField, header: string) => void;
  onReview: () => void;
}) {
  const identityFields: ImportField[] = [
    "name",
    "firstName",
    "lastName",
    "nationalId",
    "phone",
    "mobilePhone",
    "homePhone",
    "email",
  ];
  const hasIdentityMapping = identityFields.some((field) => Boolean(mapping[field]));
  const mappedFields = importFields.filter((field) => Boolean(mapping[field]));
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  const preservedDetails = parsed.headerDetails.filter((detail) => !mappedHeaders.has(detail.header));

  return (
    <div className="space-y-5 py-4">
      <div>
        <h3 className="text-sm font-black text-[#1A1A3E]">בדקי את התאמת העמודות</h3>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
          זיהינו כותרות נפוצות בעברית ובאנגלית. שדות מוכרים כבר מחוברים, ועמודות שלא ימופו יישמרו בפרטים נוספים בלי לאבד מידע.
        </p>
      </div>

      {parsed.headerWarnings.length > 0 && (
        <div className="rounded-2xl border border-[#F2D162]/70 bg-[#FFFBEA] px-3.5 py-3 text-xs text-[#69550C]">
          <p className="flex items-start gap-2 font-black">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>כדאי לשים לב לכותרות הקובץ</span>
          </p>
          <ul className="mt-1.5 space-y-1 pr-6 font-semibold leading-5">
            {parsed.headerWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-[#1A1A3E]">המיפוי שזוהה בקובץ</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              {mappedFields.length} מתוך {importFields.length} שדות סטנדרטיים מחוברים כרגע
            </p>
          </div>
          <span className="rounded-full bg-[#E8F2EA] px-2.5 py-1 text-[10px] font-black text-[#2C6A3B]">
            {mappedFields.length} שדות מזוהים
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mappedFields.length ? mappedFields.map((field) => (
            <span
              key={field}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#DCE6DF] bg-white px-2 py-1 text-[10px] font-bold text-[#1A1A3E]"
              title={`${importFieldLabels[field]}: ${mapping[field]}`}
            >
              <b>{importFieldLabels[field]}</b>
              <span className="max-w-[150px] truncate text-slate-500">{mapping[field]}</span>
            </span>
          )) : (
            <span className="text-[11px] font-semibold text-slate-500">עדיין לא זוהה מיפוי אוטומטי.</span>
          )}
        </div>
        <div className="mt-3 border-t border-[#E5E7EB] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black text-[#1A1A3E]">
              {preservedDetails.length ? `${preservedDetails.length} עמודות יישמרו בפרטים נוספים` : "כל העמודות מחוברות לשדות סטנדרטיים"}
            </p>
            {preservedDetails.length > 0 && (
              <span className="rounded-full bg-[#EEEAFE] px-2 py-0.5 text-[10px] font-black text-[#5744A4]">
                {summary.extraValues} ערכים יישמרו
              </span>
            )}
          </div>
          {preservedDetails.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preservedDetails.slice(0, 7).map((detail) => (
                <span
                  key={detail.header}
                  className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-[#E2DDF8]"
                >
                  {detail.occurrence > 1 ? `${detail.originalLabel} (${detail.occurrence})` : detail.originalLabel}
                </span>
              ))}
              {preservedDetails.length > 7 && (
                <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[#5744A4] ring-1 ring-[#E2DDF8]">
                  + עוד {preservedDetails.length - 7}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <ImportSummaryStrip summary={summary} />

      <div className="grid gap-3 sm:grid-cols-2">
        {importFields.map((field) => (
          <label key={field} className="block">
            <span className="mb-1.5 block text-[11px] font-extrabold text-slate-500">
              {importFieldLabels[field]}
            </span>
            <select
              value={mapping[field]}
              onChange={(event) => onMapping(field, event.target.value)}
              className="h-10 w-full rounded-xl border border-[#D9DEE5] bg-white px-3 text-xs font-bold text-[#1A1A3E] outline-none focus:border-[#1A1A3E]/40 focus:ring-2 focus:ring-[#F2D162]"
            >
              <option value="">לא למפות</option>
              {parsed.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!hasIdentityMapping && (
        <p className="rounded-xl bg-[#FFF4CF] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#69550C]">
          בחרי לפחות עמודת שם, שם פרטי, שם משפחה, תעודת זהות, טלפון סלולרי, טלפון בבית, טלפון כללי או אימייל כדי לזהות את הלקוחות.
        </p>
      )}
      {hasIdentityMapping && summary.rows === 0 && (
        <p className="rounded-xl bg-[#FFF4CF] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#69550C]">
          לא נמצאו שורות נתונים בקובץ אחרי שורת הכותרות. אי אפשר להמשיך בלי שורה לבדיקה.
        </p>
      )}
      {hasIdentityMapping && summary.rows > 0 && summary.validRows === 0 && (
        <p className="rounded-xl bg-[#FFF4CF] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#69550C]">
          אין שורות תקינות להמשך. כל השורות חסרות שם או פרטי זיהוי, ולכן לא תוצג אפשרות לאישור ייבוא.
        </p>
      )}

      <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black text-[#1A1A3E]">
            תצוגה מקדימה, {summary.rows} שורות ממופות
          </p>
          <span className="text-[11px] font-bold text-slate-400">
            הצגה של עד 6 שורות · הנתונים עדיין לא נשמרו
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[950px] w-full text-right text-[11px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-slate-400">
                <th className="px-2 py-2">שורה</th>
                <th className="px-2 py-2">שם ופרטי קשר</th>
                <th className="px-2 py-2">תעודת זהות</th>
                <th className="px-2 py-2">נייד / בית</th>
                <th className="px-2 py-2">כתובת, עיר ומיקוד</th>
                <th className="px-2 py-2">חיית מחמד</th>
                <th className="px-2 py-2">פרטים נוספים</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((row) => {
                const addressLine = [row.values.address, row.values.city, row.values.postalCode ? `מיקוד ${row.values.postalCode}` : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={row.rowIndex} className="border-b border-[#EEF0F3] align-top">
                    <td className="px-2 py-2 font-bold text-slate-400">{row.sourceRow}</td>
                    <td className="px-2 py-2">
                      <b className="block font-extrabold text-[#1A1A3E]">{row.values.name || "לא צוין"}</b>
                      {row.values.email && <span dir="ltr" className="mt-1 block max-w-[170px] truncate text-slate-500">{row.values.email}</span>}
                    </td>
                    <td dir="ltr" className="px-2 py-2">{row.values.nationalId || "לא צוין"}</td>
                    <td className="px-2 py-2">
                      <span className="block"><b className="text-slate-400">נייד: </b><span dir="ltr">{row.values.mobilePhone || "לא צוין"}</span></span>
                      <span className="mt-1 block"><b className="text-slate-400">בית: </b><span dir="ltr">{row.values.homePhone || row.values.phone || "לא צוין"}</span></span>
                    </td>
                    <td className="max-w-[180px] px-2 py-2">
                      {addressLine || "לא צוין"}
                    </td>
                    <td className="px-2 py-2">
                      <b className="block">{row.values.petName || "לא צוין"}</b>
                      {petSpeciesLabel(row.values.petSpecies) && <span className="mt-1 block text-slate-500">{petSpeciesLabel(row.values.petSpecies)}</span>}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.values.additionalFields.length ? "bg-[#EEEAFE] text-[#5744A4]" : "bg-slate-100 text-slate-400"}`}>
                        {row.values.additionalFields.length} ערכים
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {summary.groupedOwners > 0 && (
          <p className="mt-3 rounded-xl bg-[#FFFBEA] px-3 py-2 text-[11px] font-bold leading-5 text-[#69550C]">
            זוהו {summary.groupedOwners} קבוצות של בעלים עם כמה שורות, בסך הכול {summary.groupedRows} שורות. הן יוצגו יחד בסקירת הכפילויות, כדי שאפשר יהיה לבדוק את כל חיות המחמד לפני השמירה.
          </p>
        )}
      </div>

      {invalidRows.length > 0 && (
        <div className="rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-semibold leading-5 text-red-700">
          <b>{invalidRows.length} שורות לא תקינות לא יישמרו.</b>{" "}
          {invalidRows
            .slice(0, 3)
            .map((row) => `שורה ${row.sourceRow}: ${row.errors.join(" · ")}`)
            .join(" | ")}
          {invalidRows.length > 3 ? " · ועוד שורות" : ""}
        </div>
      )}
      <button
        type="button"
        disabled={!hasIdentityMapping || !summary.validRows}
        onClick={onReview}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
      >
        המשך לבדיקת כפילויות
        <ArrowRight className="h-4 w-4 rotate-180" />
      </button>
    </div>
  );
}

function ReviewStep({
  rows,
  decisions,
  summary,
  invalidRows,
  ready,
  onDecision,
  onContinue,
}: {
  rows: ImportReviewRow[];
  decisions: Record<number, ImportDecision>;
  summary: ImportRowsSummary;
  invalidRows: MappedImportRow[];
  ready: boolean;
  onDecision: (rowIndex: number, decision: ImportDecision) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-[#1A1A3E]">
              בדקי כל התאמה לפני שמירה
            </h3>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500">
              התאמות ודאיות לפי טלפון, אימייל או תעודת זהות מסומנות מראש לאיחוד. התאמות לפי שם בלבד מיובאות כלקוחות חדשים כברירת מחדל, ואפשר לבחור פעולה אחרת אם יש לך מידע נוסף.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-black">
            <span className="rounded-full bg-[#E8F2EA] px-2.5 py-1 text-[#2C6A3B]">
              {actionCount(rows, decisions, "new")} חדשות
            </span>
            <span className="rounded-full bg-[#EEEAFE] px-2.5 py-1 text-[#5744A4]">
              {actionCount(rows, decisions, "merge")} לאיחוד
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              {actionCount(rows, decisions, "skip")} דילוגים שבחרת
            </span>
            <span className="rounded-full bg-[#FFF2F2] px-2.5 py-1 text-[#A33A3A]">
              {summary.invalidRows} שורות לא תקינות
            </span>
          </div>
        </div>
        <div className="mt-4">
          <ImportSummaryStrip summary={summary} compact />
        </div>
      </div>

      {invalidRows.length > 0 && (
        <div className="rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-semibold leading-5 text-red-700">
          {invalidRows.length} שורות לא תקינות הושמטו מהסקירה ולא יישלחו לשמירה. הדילוג הזה נפרד מדילוגים שבחרת על שורות תקינות.
        </div>
      )}

      <ClientImportReview
        rows={rows}
        decisions={decisions}
        onDecision={onDecision}
      />
      {!ready && rows.length > 0 && (
        <p className="rounded-xl bg-[#FFF4CF] px-3 py-2.5 text-xs font-extrabold leading-5 text-[#69550C]">
          יש עדיין שורה שדורשת בחירה תקינה או יעד איחוד. בחרי פעולה לכל שורה כדי להמשיך.
        </p>
      )}
      <button
        type="button"
        disabled={!ready || !rows.length}
        onClick={onContinue}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
      >
        המשך לסיכום לפני שמירה
        <ArrowRight className="h-4 w-4 rotate-180" />
      </button>
    </div>
  );
}

function SummaryStep({
  rows,
  decisions,
  summary,
  ready,
  saving,
  onConfirm,
}: {
  rows: ImportReviewRow[];
  decisions: Record<number, ImportDecision>;
  summary: ImportRowsSummary;
  ready: boolean;
  saving: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4 py-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF4CF] text-[#69550C]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="text-center">
        <h3 className="text-xl font-black text-[#1A1A3E]">אישור ייבוא</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-slate-500">
          עדיין לא נשמרה אף שורה. לאחר האישור יישמרו רק הפעולות שבחרת, ללא יצירת תורים וללא שליחת הודעות. שורות לא תקינות כבר הושמטו ואינן חלק מהשמירה.
        </p>
      </div>
      <ImportSummaryStrip summary={summary} compact />
      <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-[#E8F2EA] p-3 text-center">
          <b className="block text-2xl font-black text-[#2C6A3B]">
            {actionCount(rows, decisions, "new")}
          </b>
          <span className="text-[11px] font-extrabold text-[#2C6A3B]">לקוחות חדשים</span>
        </div>
        <div className="rounded-xl bg-[#EEEAFE] p-3 text-center">
          <b className="block text-2xl font-black text-[#5744A4]">
            {actionCount(rows, decisions, "merge")}
          </b>
          <span className="text-[11px] font-extrabold text-[#5744A4]">שורות לאיחוד</span>
        </div>
        <div className="rounded-xl bg-slate-100 p-3 text-center">
          <b className="block text-2xl font-black text-slate-600">
            {actionCount(rows, decisions, "skip")}
          </b>
          <span className="text-[11px] font-extrabold text-slate-600">דילוגים שבחרת</span>
        </div>
        <div className="rounded-xl bg-[#FFF4CF] p-3 text-center">
          <b className="block text-2xl font-black text-[#69550C]">{summary.invalidRows}</b>
          <span className="text-[11px] font-extrabold text-[#69550C]">שורות לא תקינות</span>
        </div>
      </div>
      {!ready && (
        <p className="mx-auto max-w-xl rounded-xl bg-[#FFF4CF] px-3 py-2.5 text-center text-xs font-extrabold leading-5 text-[#69550C]">
          אי אפשר לאשר עדיין. חזרי לסקירת הכפילויות והשלימי את כל הבחירות.
        </p>
      )}
      <button
        type="button"
        disabled={saving || !ready}
        onClick={onConfirm}
        className="mx-auto flex min-h-11 w-full max-w-xl items-center justify-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-sm font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            שומרת את הלקוחות...
          </>
        ) : (
          "אישור ושמירת הלקוחות"
        )}
      </button>
    </div>
  );
}

function ImportProgressStep({ progress }: { progress: ImportSaveProgress }) {
  const hasTotal = progress.total > 0;
  const completed = hasTotal ? Math.min(Math.max(progress.completed, 0), progress.total) : 0;
  const percentage = hasTotal ? Math.round((completed / progress.total) * 100) : 0;
  const isError = progress.phase === "error";
  const isComplete = progress.phase === "complete";
  const title = progress.phase === "preparing"
    ? "מכינה את השמירה"
    : progress.phase === "writing"
      ? "שומרת את הלקוחות"
      : progress.phase === "complete"
        ? hasTotal ? "השמירה הושלמה" : "לא נדרשה שמירה"
        : "השמירה נעצרה";
  const detail = progress.phase === "preparing"
    ? "מסדרת את פעולות השמירה לפי הקבוצות והבחירות שבדקת."
    : progress.phase === "writing"
      ? `שומרת לקוחות ${completed.toLocaleString("he-IL")} מתוך ${progress.total.toLocaleString("he-IL")}`
      : progress.phase === "complete"
        ? hasTotal ? "כל פעולות השמירה הושלמו. הרשימה מתרעננת." : "לא נמצאו פעולות שמירה לביצוע."
        : hasTotal ? `השמירה נעצרה לאחר ${completed.toLocaleString("he-IL")} מתוך ${progress.total.toLocaleString("he-IL")} פעולות.` : "השמירה נעצרה לפני שנשמרה רשומה.";
  const actionLabel = progress.action === "merge" ? "איחוד עם לקוח קיים" : progress.action === "create" ? "יצירת לקוח חדש" : "";

  return (
    <div dir="rtl" aria-busy={!isError && !isComplete} className="space-y-5 py-12 text-center">
      <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${isError ? "bg-[#FFF2F2] text-[#A33A3A]" : isComplete ? "bg-[#E8F2EA] text-[#2C6A3B]" : "bg-[#EEF1FB] text-[#5267A8]"}`}>
        {isError ? <AlertTriangle className="h-8 w-8" /> : isComplete ? <CheckCircle2 className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
      </div>
      <div>
        <h3 className="text-xl font-black text-[#1A1A3E]">{title}</h3>
        <p role="status" aria-live="polite" className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-slate-500">{detail}</p>
      </div>
      <div className="mx-auto w-full max-w-xl">
        <div
          role="progressbar"
          aria-label="התקדמות שמירת הלקוחות"
          aria-valuemin={0}
          aria-valuemax={hasTotal ? progress.total : undefined}
          aria-valuenow={hasTotal ? completed : undefined}
          aria-valuetext={hasTotal ? `${completed} מתוך ${progress.total}` : detail}
          className={`h-3 overflow-hidden rounded-full ${isError ? "bg-[#F3D0D0]" : "bg-[#EEF0F3]"}`}
        >
          <div className={`h-full rounded-full ${isError ? "bg-[#A33A3A]" : isComplete ? "bg-[#2C6A3B]" : "bg-[#5267A8]"} ${hasTotal ? "transition-[width] duration-300" : "w-1/3 animate-pulse"}`} style={hasTotal ? { width: `${percentage}%` } : undefined} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-extrabold text-slate-500">
          {hasTotal ? <span>{completed.toLocaleString("he-IL")} מתוך {progress.total.toLocaleString("he-IL")}</span> : <span>מכינה את מספר פעולות השמירה</span>}
          {actionLabel && <><span aria-hidden="true" className="text-slate-300">·</span><span>{actionLabel}</span></>}
        </div>
      </div>
    </div>
  );
}

function SuccessStep({
  result,
  summary,
  onClose,
}: {
  result: ImportSaveResult;
  summary: ImportRowsSummary;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F2EA] text-[#2C6A3B]">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-black text-[#1A1A3E]">הייבוא נשמר בהצלחה</h3>
      <p className="text-sm font-medium leading-6 text-slate-500">
        הרשומות נשמרו, והרשימה התרעננה. לא נוצרו תורים ולא נשלחו הודעות. שורות לא תקינות נשארו מחוץ לשמירה.
      </p>
      <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <span className="rounded-xl bg-[#E8F2EA] px-3 py-3 text-xs font-extrabold text-[#2C6A3B]">
          {result.created} לקוחות חדשים
        </span>
        <span className="rounded-xl bg-[#EEEAFE] px-3 py-3 text-xs font-extrabold text-[#5744A4]">
          {result.merged} שורות שאוחדו
        </span>
        <span className="rounded-xl bg-slate-100 px-3 py-3 text-xs font-extrabold text-slate-600">
          {result.skipped} דילוגים שבחרת
        </span>
        <span className="rounded-xl bg-[#FFF4CF] px-3 py-3 text-xs font-extrabold text-[#69550C]">
          {summary.invalidRows} שורות לא תקינות
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-xl bg-[#1A1A3E] px-6 text-sm font-extrabold text-white focus:outline-none focus:ring-2 focus:ring-[#F2D162]"
      >
        סגירה
      </button>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#F3D0D0] bg-[#FFF8F8] px-3 py-2.5 text-xs font-extrabold leading-5 text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

export function ClientImportExportModal({
  open,
  mode,
  existingRows,
  exportRows,
  exportScopeLabel,
  onClose,
  onImport,
}: ClientImportExportModalProps) {
  const [step, setStep] = useState<ImportStep>(mode === "export" ? "summary" : "file");
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<ImportSaveProgress | null>(null);
  const saveProgressRef = useRef<ImportSaveProgress | null>(null);
  const [decisions, setDecisions] = useState<Record<number, ImportDecision>>({});
  const [saveResult, setSaveResult] = useState<ImportSaveResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(mode === "export" ? "summary" : "file");
    setParsed(null);
    setMapping(null);
    setError("");
    setSaving(false);
    setSaveProgress(null);
    saveProgressRef.current = null;
    setDecisions({});
    setSaveResult(null);
  }, [mode, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (open && event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, saving]);

  const mappedRows = useMemo(
    () => (parsed && mapping ? mapImportRows(parsed, mapping) : []),
    [mapping, parsed],
  );
  const importSummary = useMemo(
    () => summarizeImportRows(mappedRows),
    [mappedRows],
  );
  const validRows = useMemo(
    () => mappedRows.filter((row) => row.errors.length === 0),
    [mappedRows],
  );
  const invalidRows = useMemo(
    () => mappedRows.filter((row) => row.errors.length > 0),
    [mappedRows],
  );
  const reviewRows = useMemo(
    () => findDuplicateMatches(validRows, existingRows),
    [existingRows, validRows],
  );
  const ready = areImportDecisionsResolvable(reviewRows, decisions);

  if (!open) return null;

  const loadFile = async (file: File) => {
    setError("");
    try {
      const next = await parseClientImportFile(file);
      setParsed(next);
      setMapping(next.mapping);
      setDecisions({});
      setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "לא הצלחנו לקרוא את הקובץ.");
    }
  };

  const updateDecision = (rowIndex: number, decision: ImportDecision) => {
    setDecisions((current) => ({ ...current, [rowIndex]: decision }));
  };

  const goReview = () => {
    setDecisions(initialDecisions(reviewRows));
    setStep("review");
    setError("");
  };

  const plan = reviewRows.map((row) => {
    const decision = decisionForRow(row, decisions);
    return {
      rowIndex: row.rowIndex,
      sourceRow: row.sourceRow,
      values: row.values,
      action: decision.action as ImportPlanEntry["action"],
      targetKey: decision.targetKey,
      importSource: parsed?.fileName || "קובץ שהועלה",
    };
  });

  const confirmImport = async () => {
    if (!ready || saving) return;
    const preparingProgress: ImportSaveProgress = { phase: "preparing", completed: 0, total: 0 };
    const onProgress: ImportSaveProgressCallback = (progress) => {
      saveProgressRef.current = progress;
      setSaveProgress(progress);
    };
    setSaving(true);
    setError("");
    saveProgressRef.current = preparingProgress;
    setSaveProgress(preparingProgress);
    setStep("saving");
    try {
      const result = await onImport(plan, onProgress);
      setSaveResult(result);
      setStep("success");
    } catch (caught) {
      const failedProgress = saveProgressRef.current;
      const progressMessage = failedProgress?.phase === "complete"
        ? failedProgress.total
          ? `כל ${failedProgress.total.toLocaleString("he-IL")} פעולות השמירה הושלמו, אך הרשימה לא התרעננה.`
          : "השמירה הושלמה, אך הרשימה לא התרעננה."
        : failedProgress?.total
          ? `השמירה נעצרה לאחר ${failedProgress.completed.toLocaleString("he-IL")} מתוך ${failedProgress.total.toLocaleString("he-IL")} פעולות.`
          : "השמירה נעצרה לפני שנשמרה רשומה.";
      const errorMessage = caught instanceof Error && caught.message
        ? caught.message
        : "השמירה נכשלה. שום אישור הצלחה לא הוצג.";
      setError(`${progressMessage} ${errorMessage}`);
      setStep("summary");
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (saving || step === "saving") return;
    if (step === "mapping") setStep("file");
    else if (step === "review") setStep("mapping");
    else if (step === "summary") setStep("review");
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#1A1A3E]/[0.45] p-3 backdrop-blur-sm sm:items-center"
      dir="rtl"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-import-title"
        aria-busy={step === "saving"}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl"
      >
        <div className="p-5 sm:p-6">
          <ImportHeader
            step={step}
            parsed={parsed}
            mode={mode}
            onBack={back}
            onClose={onClose}
          />
          {mode === "export" ? (
            <ClientExportOptions
              rows={exportRows}
              scopeLabel={exportScopeLabel}
              onClose={onClose}
            />
          ) : (
            <div className="max-h-[calc(94vh-110px)] overflow-y-auto pr-0.5">
              <div className="mt-4">
                {step === "file" && <FileStep onFile={loadFile} />}
                {step === "mapping" && parsed && mapping ? (
                  <MappingStep
                    parsed={parsed}
                    mapping={mapping}
                    rows={mappedRows}
                    summary={importSummary}
                    invalidRows={invalidRows}
                    onMapping={(field, header) =>
                      setMapping((current) =>
                        current ? { ...current, [field]: header } : current,
                      )
                    }
                    onReview={goReview}
                  />
                ) : null}
                {step === "review" ? (
                  <ReviewStep
                    rows={reviewRows}
                    decisions={decisions}
                    summary={importSummary}
                    invalidRows={invalidRows}
                    ready={ready}
                    onDecision={updateDecision}
                    onContinue={() => setStep("summary")}
                  />
                ) : null}
                {step === "summary" ? (
                  <SummaryStep
                    rows={reviewRows}
                    decisions={decisions}
                    summary={importSummary}
                    ready={ready}
                    saving={saving}
                    onConfirm={confirmImport}
                  />
                ) : null}
                {step === "saving" && saveProgress ? <ImportProgressStep progress={saveProgress} /> : null}
                {step === "success" && saveResult ? (
                  <SuccessStep result={saveResult} summary={importSummary} onClose={onClose} />
                ) : null}
                {error ? <ErrorMessage message={error} /> : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
