import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-cyan-300/50 bg-cyan-400/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-100",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
