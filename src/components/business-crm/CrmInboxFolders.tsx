import { useState } from "react";
import {
  Archive,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  Inbox,
  Info,
  Mail,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InboxFolderKey = "inbox" | "attention" | "follow-up" | "archive" | "trash" | "marketing";

interface CrmInboxFoldersProps {
  activeFolder: InboxFolderKey;
  onFolderChange: (folder: InboxFolderKey) => void;
  inboxCount: number;
  attentionCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type FolderItem = {
  key: InboxFolderKey;
  label: string;
  icon: LucideIcon;
  count?: number;
  expandable?: boolean;
};

function folderItems(inboxCount: number, attentionCount: number): FolderItem[] {
  return [
    { key: "inbox", label: "תיבת דואר", icon: Inbox, count: inboxCount > 0 ? inboxCount : undefined },
    { key: "attention", label: "נדרשת תשומת לבך", icon: Info, count: attentionCount },
    { key: "follow-up", label: "המשך מעקב", icon: Mail },
    { key: "archive", label: "ארכיון", icon: Archive },
    { key: "trash", label: "הודעות שנמחקו / דואר זבל", icon: Trash2 },
    { key: "marketing", label: "ערוצי שיווק", icon: BarChart3, expandable: true },
  ];
}

export function CrmInboxFolders({
  activeFolder,
  onFolderChange,
  inboxCount,
  attentionCount,
  collapsed,
  onToggleCollapsed,
}: CrmInboxFoldersProps) {
  const [marketingExpanded, setMarketingExpanded] = useState(true);
  const folders = folderItems(inboxCount, attentionCount);

  return (
    <aside
      aria-label="תיקיות תיבת הדואר"
      className={cn(
        "crm-inbox-folders min-w-0 overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)] transition-[width] duration-200",
        collapsed ? "lg:w-[72px]" : "lg:w-full",
      )}
    >
      <div className={cn("crm-inbox-folder-header flex min-h-14 items-center justify-between gap-3 border-b border-[#EEF0F3] px-4", collapsed && "lg:justify-center lg:px-2")}>
        <div className={cn("flex min-w-0 items-center gap-2", collapsed && "lg:hidden")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F2D162]/[0.28] text-[#1A1A3E]">
            <Inbox className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#1A1A3E]">תיקיות</p>
            <p className="truncate text-[10px] font-semibold text-slate-400">תיבת הדואר של המרפאה</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="crm-inbox-folder-collapse flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-[#F7F7F7] hover:text-[#1A1A3E] focus:outline-none focus:ring-2 focus:ring-[#F2D162]"
          aria-label={collapsed ? "פתיחת רשימת התיקיות" : "כיווץ רשימת התיקיות"}
          title={collapsed ? "פתיחת תיקיות" : "כיווץ תיקיות"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} aria-hidden="true" />
        </button>
      </div>

      <div className={cn("crm-inbox-folder-list-wrap p-3", collapsed && "hidden lg:block lg:p-2")}>
        <div className="crm-inbox-folder-list space-y-1" role="list" aria-label="תיקיות">
          {folders.map(({ key, label, icon: Icon, count, expandable }) => {
            const active = activeFolder === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (expandable) setMarketingExpanded((open) => !open);
                  onFolderChange(key);
                }}
                aria-pressed={active}
                aria-label={collapsed ? `${label}${count !== undefined ? `, ${count}` : ""}` : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "crm-inbox-folder-item relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-[13px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#F2D162]",
                  active ? "bg-[#1A1A3E] text-white shadow-sm" : "text-[#1A1A3E]/[0.72] hover:bg-[#F7F8FA] hover:text-[#1A1A3E]",
                  collapsed && "lg:justify-center lg:px-2",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#F2D162]" : "text-slate-400")} aria-hidden="true" />
                <span className={cn("crm-inbox-folder-name min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
                {count !== undefined && (
                  <span className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[10px] font-black leading-5",
                    active ? "bg-[#F2D162] text-[#1A1A3E]" : "bg-[#F1F3F5] text-slate-500",
                    collapsed && "lg:absolute lg:-right-1 lg:-top-1 lg:min-w-4 lg:bg-[#D94C4C] lg:px-1 lg:text-[9px] lg:leading-4 lg:text-white",
                  )}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {expandable && <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-60", !marketingExpanded && "-rotate-90")} aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {marketingExpanded && !collapsed && (
          <p className="crm-inbox-marketing-note mt-2 px-3 text-[10px] font-semibold leading-4 text-slate-400">אין ערוצי שיווק מחוברים כרגע</p>
        )}
      </div>
    </aside>
  );
}
