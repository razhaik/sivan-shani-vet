import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReducedMotion } from "framer-motion";
import { Check, ChevronDown, GripVertical, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  getCrmWidgetSizeMode,
  getWidgetDimensions,
  getWidgetLayout,
  isCrmWidgetSizeOption,
  type CrmWidgetId,
  type CrmWidgetLayout,
  type CrmWidgetSize,
  type CrmWidgetSizeMode,
} from "@/lib/crmDashboardLayout";

const BOARD_GAP = 12;
const LAYOUT_HELP_ID = "crm-dashboard-layout-keyboard-help";

export interface CrmDashboardWidget {
  id: CrmWidgetId;
  label: string;
  render: (mode: CrmWidgetSizeMode) => ReactNode;
}

interface GridPlacement {
  row: number;
  column: number;
  width: number;
  height: number;
}

function columnsForViewport(width: number): number {
  if (width >= 1440) return 4;
  if (width >= 1280) return 3;
  return 2;
}

function createDensePlacements(order: CrmWidgetId[], layout: CrmWidgetLayout[], columns: number): Map<CrmWidgetId, GridPlacement> {
  const occupied: boolean[][] = [];
  const placements = new Map<CrmWidgetId, GridPlacement>();

  const fits = (row: number, column: number, width: number, height: number) => {
    if (column + width > columns) return false;
    for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
        if (occupied[row + rowOffset]?.[column + columnOffset]) return false;
      }
    }
    return true;
  };

  for (const widgetId of order) {
    const size = getWidgetLayout(layout, widgetId).size;
    const dimensions = getWidgetDimensions(size);
    const width = Math.min(columns, dimensions.columns);
    const height = dimensions.rows;
    let placement: GridPlacement | null = null;

    for (let row = 0; !placement && row < 500; row += 1) {
      for (let column = 0; column <= columns - width; column += 1) {
        if (!fits(row, column, width, height)) continue;
        placement = { row, column, width, height };
        break;
      }
    }

    if (!placement) continue;
    for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
      occupied[placement.row + rowOffset] ||= Array.from({ length: columns }, () => false);
      for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
        occupied[placement.row + rowOffset][placement.column + columnOffset] = true;
      }
    }
    placements.set(widgetId, placement);
  }

  return placements;
}

function sizeLabel(size: CrmWidgetSize): string {
  if (size === "wide") return "רחב · 2×1";
  if (size === "tall") return "גבוה · 1×2";
  if (size === "large") return "גדול · 2×2";
  return "קטן · 1×1";
}

interface SortableWidgetProps {
  widget: CrmDashboardWidget;
  order: CrmWidgetId[];
  layout: CrmWidgetLayout[];
  isEditing: boolean;
  isBoard: boolean;
  placement?: GridPlacement;
  prefersReducedMotion: boolean;
  recentlyDropped: boolean;
  onSizeChange: (widgetId: CrmWidgetId, size: CrmWidgetSize) => void;
  onKeyboardMove: (widgetId: CrmWidgetId, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

function SortableWidget({ widget, order, layout, isEditing, isBoard, placement, prefersReducedMotion, recentlyDropped, onSizeChange, onKeyboardMove }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: widget.id, disabled: !isEditing });
  const currentLayout = getWidgetLayout(layout, widget.id);
  const mode = getCrmWidgetSizeMode(currentLayout.size);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion ? "opacity 120ms ease" : transition || "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
    ...(isBoard && placement ? {
      gridColumn: `${placement.column + 1} / span ${placement.width}`,
      gridRow: `${placement.row + 1} / span ${placement.height}`,
    } : {}),
  };

  return <div
    ref={setNodeRef}
    style={style}
    data-widget-id={widget.id}
    className={cn(
      "crm-dashboard-widget relative h-full min-w-0",
      isEditing && "crm-dashboard-widget--editing",
      isDragging && "crm-dashboard-widget--drag-source",
      isOver && !isDragging && isEditing && "crm-dashboard-widget--drop-target",
      recentlyDropped && "crm-dashboard-widget--drop-flash",
    )}
  >
    {isEditing && <div className="crm-dashboard-edit-actions absolute left-2 top-2 z-30 flex items-center gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`גרירת הווידג׳ט ${widget.label}. לחיצה ממושכת במסך מגע, או Alt וחיצים במקלדת`}
        aria-describedby={LAYOUT_HELP_ID}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
        onKeyDown={(event) => onKeyboardMove(widget.id, event)}
        className="crm-dashboard-drag-handle inline-flex h-8 w-8 touch-pan-y items-center justify-center rounded-lg border border-[#D9DEE8] bg-white text-[#5267A8] shadow-sm transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162] active:cursor-grabbing"
        title="גררי את הכרטיס או השתמשי ב-Alt ובחיצים"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`בחירת גודל לווידג׳ט ${widget.label}. הגודל הנוכחי: ${sizeLabel(currentLayout.size)}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D9DEE8] bg-white text-[#5267A8] shadow-sm transition hover:border-[#5267A8] hover:bg-[#F7F8FF] focus:outline-none focus:ring-2 focus:ring-[#F2D162]">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            <ChevronDown className="-mr-1 h-3 w-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent dir="rtl" align="start" sideOffset={8} className="min-w-[190px] rounded-xl border-[#E5E7EB] bg-white p-1.5 shadow-xl">
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-extrabold text-slate-500 md:text-[11px]">גודל הווידג׳ט</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={currentLayout.size} onValueChange={(value) => { if (isCrmWidgetSizeOption(value)) onSizeChange(widget.id, value); }}>
            {(["small", "wide", "tall", "large"] as CrmWidgetSize[]).map((size) => <DropdownMenuRadioItem key={size} value={size} className="min-h-10 rounded-lg text-xs font-extrabold text-[#1A1A3E] focus:bg-[#FFFBEA] focus:text-[#1A1A3E]">
              <span>{sizeLabel(size)}</span>
              {currentLayout.size === size && <Check className="mr-auto h-4 w-4 text-[#5267A8]" aria-hidden="true" />}
            </DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>}
    {widget.render(mode)}
  </div>;
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dropTimerRef = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<CrmWidgetId | null>(null);
  const [lastDroppedId, setLastDroppedId] = useState<CrmWidgetId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [metrics, setMetrics] = useState(() => ({
    viewportWidth: typeof window === "undefined" ? 1440 : window.innerWidth,
    gridWidth: 0,
  }));
  const prefersReducedMotion = useReducedMotion() ?? false;
  const isBoard = metrics.viewportWidth >= 1024;
  const columns = columnsForViewport(metrics.viewportWidth);
  const cellSize = metrics.gridWidth > 0 ? Math.max(0, (metrics.gridWidth - BOARD_GAP * (columns - 1)) / columns) : 0;

  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const updateMetrics = () => {
      const viewportWidth = window.innerWidth;
      const gridWidth = element.getBoundingClientRect().width;
      setMetrics((current) => current.viewportWidth === viewportWidth && Math.abs(current.gridWidth - gridWidth) < 0.5
        ? current
        : { viewportWidth, gridWidth });
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateMetrics) : null;
    observer?.observe(element);
    window.addEventListener("resize", updateMetrics);
    updateMetrics();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  useLayoutEffect(() => () => {
    if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
  }, []);

  const widgetsById = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget] as const)), [widgets]);
  const orderedWidgets = order.map((id) => widgetsById.get(id)).filter((widget): widget is CrmDashboardWidget => Boolean(widget));
  const placements = useMemo(() => isBoard ? createDensePlacements(order, layout, columns) : new Map<CrmWidgetId, GridPlacement>(), [columns, isBoard, layout, order]);
  const activeWidget = activeId ? widgetsById.get(activeId) : null;
  const activeLayout = activeId ? getWidgetLayout(layout, activeId) : null;
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 9 } }),
  );

  function finishDrop(widgetId: CrmWidgetId | null) {
    setActiveId(null);
    if (!widgetId) return;
    setLastDroppedId(widgetId);
    if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
    dropTimerRef.current = window.setTimeout(() => setLastDroppedId(null), prefersReducedMotion ? 180 : 900);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id) as CrmWidgetId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id) as CrmWidgetId;
    const overId = event.over ? String(event.over.id) as CrmWidgetId : null;
    if (overId && draggedId !== overId) {
      const oldIndex = order.indexOf(draggedId);
      const newIndex = order.indexOf(overId);
      if (oldIndex >= 0 && newIndex >= 0) onOrderChange(arrayMove(order, oldIndex, newIndex));
    }
    finishDrop(draggedId);
  }

  function handleKeyboardMove(widgetId: CrmWidgetId, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!isEditing || !event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    const current = grid?.querySelector<HTMLElement>(`[data-widget-id="${widgetId}"]`);
    if (!grid || !current) return;
    const currentRect = current.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    const candidates = Array.from(grid.querySelectorAll<HTMLElement>("[data-widget-id]"))
      .filter((element) => element.dataset.widgetId !== widgetId)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return { id: element.dataset.widgetId as CrmWidgetId, x, y, dx: x - currentX, dy: y - currentY };
      })
      .filter((candidate) => event.key === "ArrowLeft" ? candidate.dx < -1
        : event.key === "ArrowRight" ? candidate.dx > 1
          : event.key === "ArrowUp" ? candidate.dy < -1
            : candidate.dy > 1)
      .sort((first, second) => {
        const firstPrimary = event.key === "ArrowLeft" || event.key === "ArrowRight" ? Math.abs(first.dx) : Math.abs(first.dy);
        const secondPrimary = event.key === "ArrowLeft" || event.key === "ArrowRight" ? Math.abs(second.dx) : Math.abs(second.dy);
        const firstSecondary = event.key === "ArrowLeft" || event.key === "ArrowRight" ? Math.abs(first.dy) : Math.abs(first.dx);
        const secondSecondary = event.key === "ArrowLeft" || event.key === "ArrowRight" ? Math.abs(second.dy) : Math.abs(second.dx);
        return firstPrimary + firstSecondary * 1.4 - (secondPrimary + secondSecondary * 1.4);
      });
    const target = candidates[0];
    if (!target) return;
    const from = order.indexOf(widgetId);
    const to = order.indexOf(target.id);
    if (from < 0 || to < 0 || from === to) return;
    onOrderChange(arrayMove(order, from, to));
    const label = widgetsById.get(widgetId)?.label || "הווידג׳ט";
    setAnnouncement(`${label} הועבר למיקום ${to + 1} מתוך ${order.length}.`);
  }

  function changeWidgetSize(widgetId: CrmWidgetId, size: CrmWidgetSize) {
    onLayoutChange(layout.map((item) => item.widget_id === widgetId ? { ...item, size } : item));
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${isBoard ? columns : metrics.viewportWidth >= 768 ? 2 : 1}, minmax(0, 1fr))`,
    ...(isBoard ? { gap: `${BOARD_GAP}px`, ...(cellSize > 0 ? { gridAutoRows: `${cellSize}px` } : {}) } : {}),
  };
  const activeDimensions = activeLayout ? getWidgetDimensions(activeLayout.size) : null;
  const overlayWidth = activeDimensions
    ? isBoard
      ? (cellSize || 280) * Math.min(columns, activeDimensions.columns) + BOARD_GAP * (Math.min(columns, activeDimensions.columns) - 1)
      : Math.max(260, Math.min(metrics.gridWidth || 420, 760))
    : 320;
  const overlayHeight = activeDimensions
    ? isBoard
      ? (cellSize || 280) * activeDimensions.rows + BOARD_GAP * (activeDimensions.rows - 1)
      : activeLayout?.size === "large" ? 330 : 240
    : 240;

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragCancel={() => finishDrop(null)} onDragEnd={handleDragEnd}>
    {isEditing && <p className="sr-only" id={LAYOUT_HELP_ID}>גרירה בעכבר מתחילה מיד. במסך מגע לחצי לחיצה ממושכת למשך 350 מילישניות ואז גררי. למקלדת, העבירי את המיקוד לידית הווידג׳ט והחזיקי Alt תוך כדי לחיצה על אחד ממקשי החצים. בתפריט הגודל אפשר לבחור קטן, רחב, גבוה או גדול.</p>}
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    <SortableContext items={orderedWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
      <div ref={gridRef} style={gridStyle} className={cn("crm-dashboard-grid min-w-0 grid grid-cols-1 gap-4 md:gap-5", isBoard ? "crm-dashboard-grid--board" : "crm-dashboard-grid--legacy")} dir="rtl">
        {orderedWidgets.map((widget) => <SortableWidget
          key={widget.id}
          widget={widget}
          order={order}
          layout={layout}
          isEditing={isEditing}
          isBoard={isBoard}
          placement={placements.get(widget.id)}
          prefersReducedMotion={prefersReducedMotion}
          recentlyDropped={lastDroppedId === widget.id}
          onSizeChange={changeWidgetSize}
          onKeyboardMove={handleKeyboardMove}
        />)}
      </div>
    </SortableContext>
    <DragOverlay dropAnimation={{ duration: prefersReducedMotion ? 120 : 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
      {activeWidget && activeLayout ? <div
        aria-hidden="true"
        className="crm-dashboard-widget--drag-overlay pointer-events-none overflow-hidden rounded-[18px] bg-white ring-2 ring-[#5267A8]/30"
        style={{ width: `${overlayWidth}px`, height: `${overlayHeight}px` }}
      >{activeWidget.render(getCrmWidgetSizeMode(activeLayout.size))}</div> : null}
    </DragOverlay>
  </DndContext>;
}
