import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmWidgetSizeMode } from "@/lib/crmDashboardLayout";

export function Card({ id, title, icon: Icon, children, className, mode }: { id?: string; title: string; icon: LucideIcon; children: ReactNode; className?: string; mode: CrmWidgetSizeMode }) {
  const compact = mode === "compact";
  return <motion.section id={id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38 }} className={cn("flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_10px_30px_-24px_rgba(26,26,62,0.65)] sm:p-5", compact ? "min-h-[180px]" : mode === "expanded" ? "min-h-[330px]" : "min-h-[240px]", className)}>
    <div className={cn("mb-4 flex shrink-0 items-center gap-3", compact && "mb-3")}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2D162]/[0.25] text-[#1A1A3E]"><Icon className="h-[18px] w-[18px]" /></span><h2 className="min-w-0 break-words text-base font-extrabold leading-5 text-[#1A1A3E]">{title}</h2></div>
    <div className="min-h-0 min-w-0 flex-1">{children}</div>
  </motion.section>;
}

export function EmptyState({ icon: Icon, title, body, action, mode }: { icon: LucideIcon; title: string; body: string; action?: ReactNode; mode: CrmWidgetSizeMode }) {
  const compact = mode === "compact";
  return <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FBFCFD] px-4 py-5 text-center", compact ? "min-h-[105px]" : mode === "expanded" ? "min-h-[220px] px-5 py-7" : "min-h-[160px] px-5 py-6")}>
    {!compact && <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[#D9DEE5] bg-white text-[#7C8795] shadow-sm"><span className="absolute inset-2 rounded-full border border-[#EEF0F3]" /><Icon className="relative h-6 w-6" strokeWidth={1.45} /></div>}
    <p className="font-extrabold text-[#1A1A3E]">{title}</p>
    {!compact && <p className="mt-1 max-w-xs text-xs font-medium leading-5 text-slate-500">{body}</p>}
    {!compact && action && <div className="mt-4">{action}</div>}
  </div>;
}

export function UnavailableButton({ children }: { children: ReactNode }) {
  return <button type="button" disabled className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#CBD2DB] bg-white px-4 text-xs font-extrabold text-slate-500 opacity-80" title="הפעולה תהיה זמינה לאחר חיבור המערכת המתאימה">{children}</button>;
}
