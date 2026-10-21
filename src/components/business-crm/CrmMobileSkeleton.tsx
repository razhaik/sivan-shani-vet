interface CrmMobileSkeletonProps {
  variant: "overview" | "calendar";
  label: string;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

export default function CrmMobileSkeleton({ variant, label }: CrmMobileSkeletonProps) {
  return (
    <div dir="rtl" role="status" aria-live="polite" aria-label={label} aria-busy="true" className="w-full space-y-3">
      <span className="sr-only">{label}</span>
      {variant === "overview" ? (
        <>
          <div aria-hidden="true" className="flex items-center justify-between px-1 py-1">
            <SkeletonBlock className="h-7 w-32" />
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
          </div>
          <div aria-hidden="true" className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-2xl border border-[#E6E8EC] bg-white p-4 shadow-sm">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-3 h-8 w-14" />
                <SkeletonBlock className="mt-3 h-2.5 w-24" />
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="rounded-2xl border border-[#E6E8EC] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-5 w-28" />
              <SkeletonBlock className="h-7 w-16 rounded-full" />
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl bg-[#F7F8FA] p-3">
                  <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-3.5 w-3/4" />
                    <SkeletonBlock className="h-2.5 w-1/2" />
                  </div>
                  <SkeletonBlock className="h-6 w-12 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div aria-hidden="true" className="px-1 py-1">
            <SkeletonBlock className="h-7 w-16" />
          </div>
          <div aria-hidden="true" className="flex gap-2 overflow-hidden rounded-2xl border border-[#E6E8EC] bg-white p-3">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBlock key={index} className="h-14 w-11 shrink-0 rounded-xl" />
            ))}
          </div>
          <div aria-hidden="true" className="flex items-center gap-2 rounded-2xl border border-[#E6E8EC] bg-white p-2">
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
            <SkeletonBlock className="h-4 min-w-0 flex-1" />
            <SkeletonBlock className="h-9 w-14 shrink-0 rounded-lg" />
            <SkeletonBlock className="h-9 w-20 shrink-0 rounded-lg" />
          </div>
          <div aria-hidden="true" className="rounded-2xl border border-[#E6E8EC] bg-white p-4 shadow-sm">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-44 max-w-full" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-[#EEF0F3] bg-[#FBFCFD] p-3">
                  <SkeletonBlock className="h-4 w-12 shrink-0" />
                  <SkeletonBlock className="h-9 w-1 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-3.5 w-3/4" />
                    <SkeletonBlock className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
