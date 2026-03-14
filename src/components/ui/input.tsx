import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus-visible:border-cyan-300",
        className
      )}
      type={type}
      {...props}
    />
  );
}

export { Input };
