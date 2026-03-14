import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root>;

function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-slate-600 transition-colors data-[state=checked]:bg-cyan-400 data-[state=unchecked]:bg-slate-700",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
