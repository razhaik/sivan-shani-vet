import type { AriaAttributes, ReactNode, Ref } from "react";
import { ChevronLeft, type LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface SettingsGroupProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
  className?: string;
}

export function SettingsGroup({ title, children, footer, id, className = "" }: SettingsGroupProps) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`space-y-2.5 ${className}`}>
      <h3 id={id ? `${id}-title` : undefined} className="px-3 text-xs font-extrabold tracking-[0.08em] text-[#6D818A]">
        {title}
      </h3>
      <div className="overflow-hidden rounded-[22px] border border-[#DCE8EC] bg-[#F9FCFC] shadow-[0_8px_24px_rgba(15,40,66,0.05)]">
        <div className="px-4">{children}</div>
      </div>
      {footer && <div className="px-3 text-xs font-semibold leading-5 text-[#748891]">{footer}</div>}
    </section>
  );
}

interface SettingsRowProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaControls?: string;
  ariaCurrent?: AriaAttributes["aria-current"];
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export function SettingsRow({
  icon: Icon,
  title,
  description,
  children,
  onClick,
  disabled = false,
  ariaLabel,
  ariaControls,
  ariaCurrent,
  buttonRef,
  className = "",
}: SettingsRowProps) {
  const rowClassName = `group flex min-h-[60px] w-full items-center gap-3 border-b border-[#E2EBEE] py-3 text-right transition last:border-b-0 ${onClick ? "cursor-pointer hover:bg-[#F2F8F9] focus:outline-none focus-visible:bg-[#F2F8F9] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2F90A1]" : ""} ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`;
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F3F5] text-[#1D6472] transition group-hover:bg-[#DDEFF2]" aria-hidden="true">
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold leading-5 text-[#16344D]">{title}</span>
        {description && <span className="mt-0.5 block text-xs font-semibold leading-5 text-[#738790]">{description}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-left">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={rowClassName}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || title}
        aria-controls={ariaControls}
        aria-current={ariaCurrent}
      >
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}

interface ChevronValueProps {
  value: string;
  className?: string;
}

export function ChevronValue({ value, className = "" }: ChevronValueProps) {
  return (
    <span className={`inline-flex max-w-[13rem] items-center gap-1.5 text-left ${className}`}>
      <span className="max-w-[10.5rem] truncate text-xs font-extrabold text-[#6A7F88] sm:max-w-[15rem]">{value}</span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-[#2F90A1]" aria-hidden="true" />
    </span>
  );
}

const statusClasses: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-[#E5F4F5] text-[#1D6472]",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
};

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

export function StatusPill({ label, tone = "neutral", className = "" }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusClasses[tone]} ${className}`} aria-live="polite">
      {label}
    </span>
  );
}
