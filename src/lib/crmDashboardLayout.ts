export const DEFAULT_CRM_WIDGET_ORDER = [
  "quick-actions",
  "customers",
  "sales",
  "appointments",
  "leads",
  "ai-chat",
  "marketing",
  "campaigns",
] as const;

export type CrmWidgetId = typeof DEFAULT_CRM_WIDGET_ORDER[number];
export type CrmWidgetSizeMode = "compact" | "medium" | "expanded";

export const MIN_CRM_WIDGET_COLUMN_SPAN = 3;
export const MAX_CRM_WIDGET_COLUMN_SPAN = 12;
export const MIN_CRM_WIDGET_ROW_SPAN = 1;
export const MAX_CRM_WIDGET_ROW_SPAN = 8;

export interface CrmWidgetLayout {
  widget_id: CrmWidgetId;
  column_span: number;
  row_span: number;
}

const DEFAULT_SIZE_BY_ID: Record<CrmWidgetId, Omit<CrmWidgetLayout, "widget_id">> = {
  "quick-actions": { column_span: 4, row_span: 3 },
  customers: { column_span: 4, row_span: 3 },
  sales: { column_span: 4, row_span: 3 },
  appointments: { column_span: 8, row_span: 4 },
  leads: { column_span: 4, row_span: 2 },
  "ai-chat": { column_span: 4, row_span: 2 },
  marketing: { column_span: 4, row_span: 3 },
  campaigns: { column_span: 4, row_span: 3 },
};

export const DEFAULT_CRM_WIDGET_LAYOUT: Record<CrmWidgetId, CrmWidgetLayout> = Object.fromEntries(
  DEFAULT_CRM_WIDGET_ORDER.map((widgetId) => [widgetId, { widget_id: widgetId, ...DEFAULT_SIZE_BY_ID[widgetId] }]),
) as Record<CrmWidgetId, CrmWidgetLayout>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedSpan(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(Math.round(value), min, max);
}

export function createDefaultCrmWidgetLayout(): CrmWidgetLayout[] {
  return DEFAULT_CRM_WIDGET_ORDER.map((widgetId) => ({ ...DEFAULT_CRM_WIDGET_LAYOUT[widgetId] }));
}

export function normalizeWidgetOrder(value: unknown): CrmWidgetId[] {
  const validIds = new Set<string>(DEFAULT_CRM_WIDGET_ORDER);
  const seen = new Set<CrmWidgetId>();
  const normalized: CrmWidgetId[] = [];
  const candidates = Array.isArray(value) ? value : [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !validIds.has(candidate) || seen.has(candidate as CrmWidgetId)) continue;
    const widgetId = candidate as CrmWidgetId;
    seen.add(widgetId);
    normalized.push(widgetId);
  }
  for (const widgetId of DEFAULT_CRM_WIDGET_ORDER) {
    if (!seen.has(widgetId)) normalized.push(widgetId);
  }
  return normalized;
}

export function normalizeWidgetLayout(value: unknown): CrmWidgetLayout[] {
  const seen = new Set<CrmWidgetId>();
  const normalized: CrmWidgetLayout[] = [];
  const candidates = Array.isArray(value) ? value : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const widgetId = entry.widget_id;
    if (typeof widgetId !== "string" || !DEFAULT_CRM_WIDGET_ORDER.includes(widgetId as CrmWidgetId) || seen.has(widgetId as CrmWidgetId)) continue;
    const id = widgetId as CrmWidgetId;
    const defaults = DEFAULT_CRM_WIDGET_LAYOUT[id];
    seen.add(id);
    normalized.push({
      widget_id: id,
      column_span: normalizedSpan(entry.column_span, MIN_CRM_WIDGET_COLUMN_SPAN, MAX_CRM_WIDGET_COLUMN_SPAN, defaults.column_span),
      row_span: normalizedSpan(entry.row_span, MIN_CRM_WIDGET_ROW_SPAN, MAX_CRM_WIDGET_ROW_SPAN, defaults.row_span),
    });
  }
  for (const widgetId of DEFAULT_CRM_WIDGET_ORDER) {
    if (!seen.has(widgetId)) normalized.push({ ...DEFAULT_CRM_WIDGET_LAYOUT[widgetId] });
  }
  return normalized;
}

export function normalizeCrmDashboardLayout(orderValue: unknown, layoutValue: unknown) {
  return {
    order: normalizeWidgetOrder(orderValue),
    widgetLayout: normalizeWidgetLayout(layoutValue),
  };
}

export function getWidgetLayout(layout: CrmWidgetLayout[], widgetId: CrmWidgetId): CrmWidgetLayout {
  return layout.find((item) => item.widget_id === widgetId) || { ...DEFAULT_CRM_WIDGET_LAYOUT[widgetId] };
}

export function getCrmWidgetSizeMode(widgetId: CrmWidgetId, currentLayout: CrmWidgetLayout): CrmWidgetSizeMode {
  const defaults = DEFAULT_CRM_WIDGET_LAYOUT[widgetId];
  const widthRatio = currentLayout.column_span / defaults.column_span;
  const heightRatio = currentLayout.row_span / defaults.row_span;
  const areaRatio = (currentLayout.column_span * currentLayout.row_span) / (defaults.column_span * defaults.row_span);
  if (areaRatio <= 0.68 || widthRatio <= 0.75 || heightRatio <= 0.75) return "compact";
  if (areaRatio >= 1.3 || widthRatio >= 1.4 || heightRatio >= 1.35) return "expanded";
  return "medium";
}
