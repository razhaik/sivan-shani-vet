import React from "react";
import { CalendarDays, CalendarRange, ClipboardList, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: "today", label: "היום", icon: CalendarDays },
    { id: "schedule", label: "לוח זמנים", icon: CalendarRange },
    { id: "appointments", label: "תורים", icon: ClipboardList },
    { id: "clients", label: "לקוחות", icon: Users },
    { id: "settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-colors",
                isActive ? "text-blue-600" : "text-slate-400"
              )}
            >
              <Icon className={cn("w-5 h-5 mb-1", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
              <span className="text-[10px] font-bold leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
