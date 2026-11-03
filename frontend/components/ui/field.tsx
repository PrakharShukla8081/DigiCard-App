import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-w-0 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-muted/70 outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60 aria-[invalid=true]:border-bad";

export function Input({ className, ...p }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-10 py-0", className)} {...p} />;
}

export function Textarea({ className, ...p }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[84px] resize-y", className)} {...p} />;
}

export function Select({ className, children, ...p }: React.ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-10 py-0 pr-8", className)} {...p}>
      {children}
    </select>
  );
}

export function Label({ className, ...p }: React.ComponentProps<"label">) {
  return <label className={cn("text-[12px] font-semibold text-muted", className)} {...p} />;
}

/** Label + control + optional hint / error in a column. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
  right,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {right}
      </div>
      {children}
      {error ? <p className="text-[12px] font-medium text-bad">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...p }: React.ComponentProps<"input"> & { label?: React.ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" className="size-4 accent-[var(--accent)]" {...p} />
      {label}
    </label>
  );
}
