import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsLeftRight, ChevronsUpDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCrmWidgetSizeMode,
  getWidgetLayout,
  MAX_CRM_WIDGET_COLUMN_SPAN,
  MAX_CRM_WIDGET_ROW_SPAN,
  MIN_CRM_WIDGET_COLUMN_SPAN,
  MIN_CRM_WIDGET_ROW_SPAN,
  type CrmWidgetId,
  type CrmWidgetLayout,
  type CrmWidgetSizeMode,
} from "@/lib/crmDashboardLayout";

export interface CrmDashboardWidget {
  id: CrmWidgetId;
  label: string;
  render: (mode: CrmWidgetSizeMode) => ReactNode;
}

const XL_COLUMN_CLASSES: Record<number, string> = {
  3: "xl:col-span-3", 4: "xl:col-span-4", 5: "xl:col-span-5", 6: "xl:col-span-6",
  7: "xl:col-span-7", 8: "xl:col-span-8", 9: "xl:col-span-9", 10: "xl:col-span-10",
  11: "xl:col-span-11", 12: "xl:col-span-12",
};
const MD_COLUMN_CLASSES: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2" };
const MD_ROW_CLASSES: Record<number, string> = { 1: "md:row-span-1", 2: "md:row-span-2", 3: "md:row-span-3", 4: "md:row-span-4" };
const XL_ROW_CLASSES: Record<number, string> = {
  1: "xl:row-span-1", 2: "xl:row-span-2", 3: "xl:row-span-3", 4: "xl:row-span-4",
  5: "xl:row-span-5", 6: "xl:row-span-6", 7: "xl:row-span-[7]", 8: "xl:row-span-[8]",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function widgetGridClasses(layout: CrmWidgetLayout) {
  const desktopSpan = clamp(layout.column_span, MIN_CRM_WIDGET_COLUMN_SPAN, MAX_CRM_WIDGET_COLUMN_SPAN);
  const tabletSpan = desktopSpan >= 7 ? 2 : 1;
  const tabletRows = clamp(Math.ceil(layout.row_span / 2), 1, 4);
  const desktopRows = clamp(layout.row_span, MIN_CRM_WIDGET_ROW_SPAN, MAX_CRM_WIDGET_ROW_SPAN);
  return cn("col-span-1 row-span-1 min-w-0", MD_COLUMN_CLASSES[tabletSpan], MD_ROW_CLASSES[tabletRows], XL_COLUMN_CLASSES[desktopSpan], XL_ROW_CLASSES[desktopRows]);
}

function viewportColumns() {
  if (typeof window === "undefined") return 12;
  if (window.innerWidth >= 1280) return 12;
  if (window.innerWidth >= 768) return 2;
  return 12;
}

interface ResizeSession {
  axis: "width" | "height";
  pointerId: number;
  startX: number;
  startY: number;
  startColumnSpan: number;
  startRowSpan: number;
}

interface SortableWidgetProps {
  widget: CrmDashboardWidget;
  layout: CrmWidgetLayout[];
  isEditing: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  onLayoutChange: (nextLayout: CrmWidgetLayout[]) => void;
}

function SortableWidget({ widget, layout, isEditing, gridRef, onLayoutChange }: SortableWidgetProps) {
  const resizeSession = useRef<ResizeSession | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [isResizing, setIsResizing] = useState<"width" | "height" | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, over } = useSortable({ id: widget.id, disabled: !isEditing });
  const currentLayout = getWidgetLayout(layout, widget.id);
  const mode = getCrmWidgetSizeMode(widget.id, currentLayout);
  const isOver = over?.id === widget.id;

  function updateDimension(axis: "width" | "height", value: number) {
    const nextValue = axis === "width"
      ? clamp(Math.round(value), MIN_CRM_WIDGET_COLUMN_SPAN, MAX_CRM_WIDGET_COLUMN_SPAN)
      : clamp(Math.round(value), MIN_CRM_WIDGET_ROW_SPAN, MAX_CRM_WIDGET_ROW_SPAN);
    const nextLayout = layoutRef.current.map((item) => item.widget_id === widget.id
      ? { ...item, [axis === "width" ? "column_span" : "row_span"]: nextValue }
      : item);
    layoutRef.current = nextLayout;
    onLayoutChange(nextLayout);
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, axis: "width" | "height") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizeSession.current = { axis, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startColumnSpan: currentLayout.column_span, startRowSpan: currentLayout.row_span };
    setIsResizing(axis);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (session.axis === "width") {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      const columns = viewportColumns();
      const gap = 20;
      const unit = Math.max(8, (rect.width - gap * (columns - 1)) / columns);
      const delta = Math.round((session.startX - event.clientX) / (unit + gap));
      if (columns === 2) {
        const startTabletSpan = session.startColumnSpan >= 7 ? 2 : 1;
        updateDimension("width", clamp(startTabletSpan + delta, 1, 2) === 2 ? MAX_CRM_WIDGET_COLUMN_SPAN : MIN_CRM_WIDGET_COLUMN_SPAN);
      } else {
        updateDimension("width", session.startColumnSpan + delta);
      }
    } else {
      const rowStep = typeof window !== "undefined" && window.innerWidth >= 1280 ? 108 : 116;
      const delta = Math.round((event.clientY - session.startY) / rowStep);
      updateDimension("height", session.startRowSpan + delta);
    }
  }

  function endResize(event?: ReactPointerEvent<HTMLButtonElement>) {
    if (event && resizeSession.current?.pointerId !== event.pointerId) return;
    if (event && event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeSession.current = null;
    setIsResizing(null);
  }

  function keyboardResize(event: ReactKeyboardEvent<HTMLButtonElement>, axis: "width" | "height") {
    const isHorizontal = axis === "width";
    const increment = isHorizontal ? (event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0) : (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
    const min = isHorizontal ? MIN_CRM_WIDGET_COLUMN_SPAN : MIN_CRM_WIDGET_ROW_SPAN;
    const max = isHorizontal ? MAX_CRM_WIDGET_COLUMN_SPAN : MAX_CRM_WIDGET_ROW_SPAN;
    const current = isHorizontal ? currentLayout.column_span : currentLayout.row_span;
    const next = event.key === "Home" ? min : event.key === "End" ? max : current + increment;
    if (next === current || (increment === 0 && event.key !== "Home" && event.key !== "End")) return;
    event.preventDefault();
    event.stopPropagation();
    updateDimension(axis, next);
  }

  const resizeButton = "pointer-events-auto absolute z-30 flex h-8 w-8 touch-none items-center justify-center rounded-lg border border-[#C7D0E0] bg-white/95 text-[#5267A8] shadow-sm transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162] active:bg-[#EEF2FF]";
  const style = { transform: CSS.Transform.toString(transform), transition: transition || "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" };

  return (
    <div ref={setNodeRef} style={style} className={cn(widgetGridClasses(currentLayout), "relative h-full", isEditing && "rounded-[18px] border border-dashed border-[#B7C1D3] p-1 pb-7 transition-colors", isEditing && isOver && !isDragging && "border-[#5267A8] bg-[#F1F4FF]", isDragging && "z-30 opacity-[0.35]", isResizing && "z-30 ring-2 ring-[#F2D162]")}>
      {isEditing && isOver && !isDragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-[17px] border-2 border-dashed border-[#5267A8] bg-[#EEF2FF]/[0.82] pt-3"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#5267A8] shadow-sm">מקום הכרטיס כאן</span></div>}
      {isEditing && <>
        <button type="button" {...attributes} {...listeners} className="absolute left-2 top-2 z-30 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-xl border border-[#D9DEE8] bg-white text-[#5267A8] shadow-sm transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162] active:cursor-grabbing" aria-label={`גרירת כרטיס ${widget.label}. השתמשי במקשי החצים לשינוי הסדר`} aria-describedby="crm-layout-keyboard-help"><GripVertical className="h-5 w-5" aria-hidden="true" /><span className="sr-only">גרירת כרטיס {widget.label}</span></button>
        <div className="pointer-events-none absolute inset-0 z-20">
          <button type="button" role="slider" aria-orientation="horizontal" aria-valuemin={MIN_CRM_WIDGET_COLUMN_SPAN} aria-valuemax={MAX_CRM_WIDGET_COLUMN_SPAN} aria-valuenow={currentLayout.column_span} aria-valuetext={`${currentLayout.column_span} מתוך 12 עמודות`} aria-label={`שינוי רוחב כרטיס ${widget.label}`} title="שינוי רוחב הכרטיס" className={cn(resizeButton, "bottom-1 left-2", isResizing === "width" && "bg-[#EEF2FF]")} onPointerDown={(event) => beginResize(event, "width")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={() => endResize()} onKeyDown={(event) => keyboardResize(event, "width")}><ChevronsLeftRight className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" role="slider" aria-orientation="vertical" aria-valuemin={MIN_CRM_WIDGET_ROW_SPAN} aria-valuemax={MAX_CRM_WIDGET_ROW_SPAN} aria-valuenow={currentLayout.row_span} aria-valuetext={`${currentLayout.row_span} מתוך 8 שורות`} aria-label={`שינוי גובה כרטיס ${widget.label}`} title="שינוי גובה הכרטיס" className={cn(resizeButton, "bottom-1 right-2", isResizing === "height" && "bg-[#EEF2FF]")} onPointerDown={(event) => beginResize(event, "height")} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={() => endResize()} onKeyDown={(event) => keyboardResize(event, "height")}><ChevronsUpDown className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </>}
      <div className={cn("relative h-full min-w-0", isEditing && isOver && !isDragging && "opacity-[0.45]")}>{widget.render(mode)}</div>
    </div>
  );
}

interface CrmDashboardLayoutEditorProps {
  widgets: CrmDashboardWidget[];
  order: CrmWidgetId[];
  layout: CrmWidgetLayout[];
  isEditing: boolean;
  onOrderChange: (nextOrder: CrmWidgetId[]) => void;
  onLayoutChange: (nextLayout: CrmWidgetLayout[]) => void;
}

export function CrmDashboardLayoutEditor({ widgets, order, layout, isEditing, onOrderChange, onLayoutChange }: CrmDashboardLayoutEditorProps) {
  const [activeId, setActiveId] = useState<CrmWidgetId | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const widgetsById = new Map<CrmWidgetId, CrmDashboardWidget>(widgets.map((widget) => [widget.id, widget] as const));
  const orderedWidgets = [...order.map((id) => widgetsById.get(id)).filter((widget): widget is CrmDashboardWidget => Boolean(widget)), ...widgets.filter((widget) => !order.includes(widget.id))];
  const activeWidget = activeId ? widgetsById.get(activeId) : null;
  const activeLayout = activeId ? getWidgetLayout(layout, activeId) : null;

  function handleDragStart(event: DragStartEvent) { setActiveId(String(event.active.id) as CrmWidgetId); }
  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) as CrmWidgetId : null;
    const draggedId = String(event.active.id) as CrmWidgetId;
    if (overId && draggedId !== overId) {
      const oldIndex = order.indexOf(draggedId);
      const newIndex = order.indexOf(overId);
      if (oldIndex >= 0 && newIndex >= 0) onOrderChange(arrayMove(order, oldIndex, newIndex));
    }
    setActiveId(null);
  }

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
    {isEditing && <p className="sr-only" id="crm-layout-keyboard-help">אפשר לגרור כל כרטיס באמצעות הידית. במקלדת, מקשי החצים משנים את הסדר. ידיות הרוחב והגובה משנות גודל, ומקש Home או End קובע גודל מינימלי או מקסימלי.</p>}
    <SortableContext items={orderedWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
      <div ref={gridRef} className="grid min-w-0 grid-cols-1 auto-rows-auto gap-5 md:grid-cols-2 md:auto-rows-[96px] xl:grid-cols-12 xl:auto-rows-[88px]" dir="rtl">
        {orderedWidgets.map((widget) => <SortableWidget key={widget.id} widget={widget} layout={layout} isEditing={isEditing} gridRef={gridRef} onLayoutChange={onLayoutChange} />)}
      </div>
    </SortableContext>
    <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
      {activeWidget && activeLayout ? <div dir="rtl" className="relative min-w-0 rounded-[18px] bg-white p-1 shadow-2xl ring-2 ring-[#5267A8]/30" style={{ width: `${Math.max(280, Math.min(960, activeLayout.column_span / 12 * 960))}px`, minHeight: `${Math.max(180, activeLayout.row_span * 88 + (activeLayout.row_span - 1) * 20)}px` }}>{activeWidget.render(getCrmWidgetSizeMode(activeWidget.id, activeLayout))}</div> : null}
    </DragOverlay>
  </DndContext>;
}
