import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, dir = "ltr", ...props }, ref) => (
  <SwitchPrimitives.Root
    dir={dir}
    className={cn(
      "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-slate-300 bg-slate-200 p-0.5 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B43C] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-teal-700 data-[state=unchecked]:bg-slate-200",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-out data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
