import * as XLSX from "xlsx";
import type { SalesDateRange } from "@/components/business-crm/salesData";

export type SalesReportKind = "appointments" | "services" | "customers" | "inquiries";
export type SalesExportFormat = "csv" | "xlsx";
export type SalesExportValue = string | number | boolean | null | undefined;

export interface SalesExportData {
  kind: SalesReportKind;
  range: SalesDateRange;
  headers: string[];
  rows: Array<Array<SalesExportValue>>;
}

const reportNames: Record<SalesReportKind, string> = {
  appointments: "תורים",
  services: "שירותים",
  customers: "לקוחות",
  inquiries: "פניות",
};

function cellText(value: SalesExportValue): string {
  return value === null || value === undefined ? "" : String(value);
}

function worksheetValue(value: SalesExportValue): string | number | boolean {
  return value === null || value === undefined ? "" : value;
}

function protectFormulaText(value: string): string {
  return /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: SalesExportValue): string {
  const safeValue = protectFormulaText(cellText(value));
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

function reportMatrix(data: SalesExportData): SalesExportValue[][] {
  return [data.headers, ...data.rows];
}

export function createSalesCsv(data: SalesExportData): Blob {
  const content = reportMatrix(data)
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
  return new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
}

export function createSalesXlsx(data: SalesExportData): Blob {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(reportMatrix(data).map((row) => row.map(worksheetValue)));
  XLSX.utils.book_append_sheet(workbook, worksheet, reportNames[data.kind]);
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadSalesReport(data: SalesExportData, format: SalesExportFormat): void {
  const blob = format === "csv" ? createSalesCsv(data) : createSalesXlsx(data);
  const filename = `דוח-${reportNames[data.kind]}-${data.range.start}-${data.range.end}.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
