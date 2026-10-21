export const DEFAULT_CRM_WIDGET_ORDER = [
  "appointmentCalendar",
  "pendingApprovals",
  "quickMenu",
  "appointmentsThisMonth",
  "clients",
  "newLeads",
] as const;

export type CrmWidgetId = typeof DEFAULT_CRM_WIDGET_ORDER[number];
export type CrmWidgetSize = "small" | "wide" | "tall" | "large";
export type CrmWidgetSizeMode = "compact" | "medium" | "expanded";

export interface CrmWidgetLayout {
  widget_id: CrmWidgetId;
  size: CrmWidgetSize;
}

export interface StoredCrmDashboardWidget {
  widget_id: CrmWidgetId;
  size: CrmWidgetSize;
}

const SIZE_SET = new Set<string>(["small", "wide", "tall", "large"]);
const WIDGET_SET = new Set<string>(DEFAULT_CRM_WIDGET_ORDER);

export const DEFAULT_CRM_WIDGET_LAYOUT: Record<CrmWidgetId, CrmWidgetLayout> = {
  appointmentCalendar: { widget_id: "appointmentCalendar", size: "large" },
  pendingApprovals: { widget_id: "pendingApprovals", size: "small" },
  quickMenu: { widget_id: "quickMenu", size: "small" },
  appointmentsThisMonth: { widget_id: "appointmentsThisMonth", size: "small" },
  clients: { widget_id: "clients", size: "wide" },
  newLeads: { widget_id: "newLeads", size: "small" },
};

const LEGACY_WIDGET_MAP: Record<string, CrmWidgetId | undefined> = {
  appointments: "appointmentCalendar",
  "quick-actions": "quickMenu",
  customers: "clients",
  leads: "newLeads",
};

export function createDefaultCrmWidgetLayout(): CrmWidgetLayout[] {
  return DEFAULT_CRM_WIDGET_ORDER.map((widgetId) => ({ ...DEFAULT_CRM_WIDGET_LAYOUT[widgetId] }));
}

function isCrmWidgetId(value: unknown): value is CrmWidgetId {
  return typeof value === "string" && WIDGET_SET.has(value);
}

function isCrmWidgetSize(value: unknown): value is CrmWidgetSize {
  return typeof value === "string" && SIZE_SET.has(value);
}

function entryWidgetId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const entry = value as Record<string, unknown>;
  return typeof entry.widget_id === "string" ? entry.widget_id : typeof entry.id === "string" ? entry.id : "";
}

export function normalizeCrmDashboardLayout(value: unknown) {
  const candidates = Array.isArray(value) ? value : [];
  const seen = new Set<CrmWidgetId>();
  const sizes = new Map<CrmWidgetId, CrmWidgetSize>();
  const order: CrmWidgetId[] = [];

  for (const candidate of candidates) {
    const widgetIdValue = entryWidgetId(candidate);
    if (!isCrmWidgetId(widgetIdValue) || seen.has(widgetIdValue)) continue;
    const entry = candidate as Record<string, unknown>;
    const size = isCrmWidgetSize(entry.size) ? entry.size : DEFAULT_CRM_WIDGET_LAYOUT[widgetIdValue].size;
    seen.add(widgetIdValue);
    order.push(widgetIdValue);
    sizes.set(widgetIdValue, size);
  }

  for (const widgetId of DEFAULT_CRM_WIDGET_ORDER) {
    if (seen.has(widgetId)) continue;
    seen.add(widgetId);
    order.push(widgetId);
    sizes.set(widgetId, DEFAULT_CRM_WIDGET_LAYOUT[widgetId].size);
  }

  return {
    order,
    widgetLayout: order.map((widgetId) => ({ widget_id: widgetId, size: sizes.get(widgetId) || DEFAULT_CRM_WIDGET_LAYOUT[widgetId].size })),
  };
}

function mergeNewWidgetsIntoLegacyOrder(order: CrmWidgetId[]): CrmWidgetId[] {
  const merged = [...order];
  const seen = new Set(merged);

  for (let defaultIndex = 0; defaultIndex < DEFAULT_CRM_WIDGET_ORDER.length; defaultIndex += 1) {
    const widgetId = DEFAULT_CRM_WIDGET_ORDER[defaultIndex];
    if (seen.has(widgetId)) continue;

    const previousAnchor = [...DEFAULT_CRM_WIDGET_ORDER.slice(0, defaultIndex)].reverse().find((candidate) => seen.has(candidate));
    if (previousAnchor) {
      merged.splice(merged.indexOf(previousAnchor) + 1, 0, widgetId);
    } else {
      const nextAnchor = DEFAULT_CRM_WIDGET_ORDER.slice(defaultIndex + 1).find((candidate) => seen.has(candidate));
      if (nextAnchor) merged.splice(merged.indexOf(nextAnchor), 0, widgetId);
      else merged.push(widgetId);
    }
    seen.add(widgetId);
  }

  return merged;
}

export function migrateLegacyCrmDashboardLayout(orderValue: unknown, legacyLayoutValue: unknown) {
  const candidates = [
    ...(Array.isArray(orderValue) ? orderValue : []),
    ...(Array.isArray(legacyLayoutValue) ? legacyLayoutValue : []),
  ];
  const seen = new Set<CrmWidgetId>();
  const migratedOrder: CrmWidgetId[] = [];

  for (const candidate of candidates) {
    const legacyId = typeof candidate === "string" ? candidate : entryWidgetId(candidate);
    const widgetId = LEGACY_WIDGET_MAP[legacyId];
    if (!widgetId || seen.has(widgetId)) continue;
    seen.add(widgetId);
    migratedOrder.push(widgetId);
  }

  if (migratedOrder.length === 0) return normalizeCrmDashboardLayout(createDefaultCrmWidgetLayout());

  // Legacy 12-column dimensions do not map cleanly to square 1x1 and 2x2 cells.
  // Keep each matching widget's relative order and use the new fixed-size defaults.
  const mergedOrder = mergeNewWidgetsIntoLegacyOrder(migratedOrder);
  return normalizeCrmDashboardLayout(mergedOrder.map((widgetId) => ({
    widget_id: widgetId,
    size: DEFAULT_CRM_WIDGET_LAYOUT[widgetId].size,
  })));
}

export function getWidgetLayout(layout: CrmWidgetLayout[], widgetId: CrmWidgetId): CrmWidgetLayout {
  return layout.find((item) => item.widget_id === widgetId) || { ...DEFAULT_CRM_WIDGET_LAYOUT[widgetId] };
}

export function getCrmWidgetSizeMode(size: CrmWidgetSize): CrmWidgetSizeMode {
  if (size === "small") return "compact";
  if (size === "large") return "expanded";
  return "medium";
}

export function getWidgetDimensions(size: CrmWidgetSize): { columns: number; rows: number } {
  if (size === "wide") return { columns: 2, rows: 1 };
  if (size === "tall") return { columns: 1, rows: 2 };
  if (size === "large") return { columns: 2, rows: 2 };
  return { columns: 1, rows: 1 };
}

export function isCrmWidgetSizeOption(value: string): value is CrmWidgetSize {
  return isCrmWidgetSize(value);
}
