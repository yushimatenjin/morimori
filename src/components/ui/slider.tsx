import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SliderProps = ComponentProps<typeof SliderPrimitive.Root>;

function Slider({ className, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root className={cn("relative flex w-full touch-none items-center select-none", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-700">
        <SliderPrimitive.Range className="absolute h-full bg-cyan-300" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-cyan-50 bg-cyan-300 shadow transition-colors focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}

export { Slider };
