import * as React from "react";
import { Check, Download, FileSpreadsheet } from "lucide-react";
import { buildExportColumns, downloadClientExport, type ClientExportColumn } from "@/lib/clientExport";
import type { ClientRow } from "@/lib/crmClientData";

const columnKeys = (columns: ClientExportColumn[]) => columns.map((column) => column.key);

export function ClientExportOptions({ rows, scopeLabel, onClose }: { rows: ClientRow[]; scopeLabel: string; onClose: () => void }) {
  const availableColumns = React.useMemo(() => buildExportColumns(rows), [rows]);
  const defaultColumnKeys = React.useMemo(() => columnKeys(availableColumns), [availableColumns]);
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>(defaultColumnKeys);
  const [format, setFormat] = React.useState<"csv" | "xlsx">("csv");
  const [downloaded, setDownloaded] = React.useState(false);

  React.useEffect(() => {
    setSelectedKeys(defaultColumnKeys);
    setDownloaded(false);
  }, [defaultColumnKeys]);

  const selectedColumns = React.useMemo(
    () => availableColumns.filter((column) => selectedKeys.includes(column.key)),
    [availableColumns, selectedKeys],
  );

  const toggle = (key: string) => {
    setDownloaded(false);
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const exportNow = () => {
    if (!selectedColumns.length || !rows.length) return;
    downloadClientExport(rows, selectedColumns, format);
    setDownloaded(true);
  };

  return <div dir="rtl">
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#FBFCFD] p-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 text-[#5267A8]" />
        <div>
          <h3 className="text-sm font-black text-[#1A1A3E]">בחירת עמודות לייצוא</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{scopeLabel}. הקובץ יכלול רק מידע שנשמר בפועל, ללא מזהים פנימיים או מידע מהיומן הרפואי הפרטי.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setSelectedKeys(columnKeys(availableColumns)); setDownloaded(false); }} className="rounded-lg px-2 py-1 text-[11px] font-extrabold text-[#5267A8] hover:bg-white">בחירת הכל</button>
        <button type="button" onClick={() => { setSelectedKeys([]); setDownloaded(false); }} className="rounded-lg px-2 py-1 text-[11px] font-extrabold text-slate-500 hover:bg-white">ניקוי הכל</button>
        {availableColumns.some((column) => column.kind === "additional") && <span className="mr-auto rounded-full bg-[#EEEAFE] px-2.5 py-1 text-[10px] font-black text-[#5744A4]">כולל עמודות מהגיליון</span>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {availableColumns.map((column) => <label key={column.key} title={column.label} className={`flex min-h-11 min-w-0 items-center gap-3 rounded-xl border px-3 text-xs font-extrabold transition ${selectedKeys.includes(column.key) ? "border-[#F2D162] bg-[#FFFBEA] text-[#1A1A3E]" : "border-[#EEF0F3] bg-white text-slate-500"}`}>
          <input type="checkbox" checked={selectedKeys.includes(column.key)} onChange={() => toggle(column.key)} className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#1A1A3E]" />
          <span className="min-w-0 truncate">{column.label}</span>
          {column.kind === "additional" && <span className="mr-auto shrink-0 rounded-full bg-[#F3F0FF] px-1.5 py-0.5 text-[9px] font-black text-[#5744A4]">מהגיליון</span>}
        </label>)}
      </div>
    </div>
    <fieldset className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <legend className="px-2 text-xs font-black text-[#1A1A3E]">סוג הקובץ</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-extrabold ${format === "csv" ? "border-[#1A1A3E] bg-[#FBFCFD]" : "border-[#EEF0F3]"}`}><input type="radio" name="export-format" checked={format === "csv"} onChange={() => setFormat("csv")} className="accent-[#1A1A3E]" />CSV, מתאים לשיתוף ולפתיחה בכל מערכת</label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-extrabold ${format === "xlsx" ? "border-[#1A1A3E] bg-[#FBFCFD]" : "border-[#EEF0F3]"}`}><input type="radio" name="export-format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} className="accent-[#1A1A3E]" />Excel, קובץ XLSX לעריכה</label>
      </div>
    </fieldset>
    {downloaded && <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#E8F2EA] px-3 py-2.5 text-xs font-extrabold text-[#2C6A3B]"><Check className="h-4 w-4" />הקובץ נוצר וההורדה התחילה.</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#D9DEE5] bg-white px-4 text-xs font-extrabold text-[#1A1A3E]">סגירה</button>
      <button type="button" disabled={!rows.length || !selectedColumns.length} onClick={exportNow} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1A1A3E] px-4 text-xs font-extrabold text-white transition hover:bg-[#2A2A5A] focus:outline-none focus:ring-2 focus:ring-[#F2D162] disabled:cursor-not-allowed disabled:opacity-45"><Download className="h-4 w-4" />יצירת קובץ {format.toUpperCase()}</button>
    </div>
  </div>;
}
