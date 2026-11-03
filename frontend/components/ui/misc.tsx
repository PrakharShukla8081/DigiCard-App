"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn, copyText } from "@/lib/utils";
import { Button } from "./button";

/* ───── Panel ───── */
export function Panel({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...p} />;
}
export function PanelHeader({ title, actions, sub, className }: { title: React.ReactNode; actions?: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───── Page header ───── */
export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-bold">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───── Status chip ───── */
const tones = {
  ok: "text-ok bg-ok-soft",
  warn: "text-warn bg-warn-soft",
  bad: "text-bad bg-bad-soft",
  accent: "text-accent bg-accent-soft",
  muted: "text-muted bg-surface-2",
};
export function Chip({ tone = "muted", children, dot = true, className }: { tone?: keyof typeof tones; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function SubStatusChip({ status }: { status?: string | null }) {
  const s = status || "none";
  const tone = s === "active" ? "ok" : s === "trial" ? "accent" : s === "expired" || s === "cancelled" ? "bad" : s === "suspended" ? "warn" : "muted";
  return <Chip tone={tone}>{s === "none" ? "No plan" : s[0]!.toUpperCase() + s.slice(1)}</Chip>;
}

/* ───── Stat tile ───── */
export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <Panel className="p-4">
      <div className="eyebrow">{label}</div>
      <div className={cn("tabular mt-1 font-display text-[28px] leading-tight font-bold", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </Panel>
  );
}

/* ───── Loading / empty ───── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} />;
}
export function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="size-7" />
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}
export function Empty({ icon, title, sub, action }: { icon?: React.ReactNode; title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted [&_svg]:size-6">{icon}</div>}
      <div className="font-bold">{title}</div>
      {sub && <p className="max-w-md text-[13px] text-muted">{sub}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3 border-bad/40 bg-bad-soft/40 p-4">
      <p className="font-medium text-bad">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Panel>
  );
}

/* ───── Switch ───── */
export function Switch({ checked, onCheckedChange, disabled, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; label?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full bg-line transition-colors data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[19px]" />
    </SwitchPrimitive.Root>
  );
}

export function ToggleRow({ title, sub, checked, onChange, disabled, locked }: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; locked?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {(sub || locked) && <div className="text-[12px] text-muted">{locked || sub}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled || Boolean(locked)} label={title} />
    </div>
  );
}

/* ───── Dialog ───── */
export function Dialog({ open, onOpenChange, title, sub, children, footer, wide }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0b0f1a]/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-surface shadow-2xl outline-none",
            wide ? "max-w-2xl" : "max-w-lg"
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-bold">{title}</DialogPrimitive.Title>
              {sub ? <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{sub}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ───── Confirm (promise based) ───── */
type ConfirmOpts = { title: string; body?: React.ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = React.createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = React.useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(state)}
        onOpenChange={(o) => !o && close(false)}
        title={state?.title || ""}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmLabel || "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{state?.body}</div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => React.useContext(ConfirmCtx);

/* ───── Copy field ───── */
export function CopyField({ value, label = "Copy", mono = true, className }: { value: string; label?: string; mono?: boolean; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface py-1.5 pr-1.5 pl-3", className)}>
      <code className={cn("min-w-0 flex-1 truncate text-[12px]", mono && "font-mono")} title={value}>
        {value}
      </code>
      <Button
        size="sm"
        type="button"
        onClick={async () => {
          const ok = await copyText(value);
          if (ok) {
            setDone(true);
            toast.success("Copied");
            setTimeout(() => setDone(false), 1500);
          } else toast.error("Could not copy. Select the text and copy it manually.");
        }}
      >
        {done ? <Check /> : <Copy />}
        {label}
      </Button>
    </div>
  );
}

/** Shown after inviting someone: whether the email went out, plus the link to share manually. */
export function InviteResult({ invite, email }: { invite: { link: string; emailSent: boolean; emailError: string | null }; email: string }) {
  return (
    <div className="flex flex-col gap-2">
      {invite.emailSent ? (
        <p className="text-sm text-ok">Invite email sent to {email}.</p>
      ) : (
        <p className="text-sm text-warn">The invite email was not sent ({invite.emailError === "not_configured" ? "email is not configured on the server" : invite.emailError}). Share this link with {email} yourself. It is valid for 7 days.</p>
      )}
      <CopyField value={invite.link} />
    </div>
  );
}

/* ───── Pagination ───── */
export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span className="tabular">
        {(page - 1) * limit + 1}–{Math.min(total, page * limit)} of {total.toLocaleString("en-IN")}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/* ───── Segmented control ───── */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("cursor-pointer rounded-[7px] px-3 py-1.5 text-[13px] font-semibold text-muted", value === o.value && "bg-surface text-fg shadow-[var(--shadow)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───── Table helpers ───── */
export function Table({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className, ...p }: React.ComponentProps<"th">) {
  return (
    <th className={cn("border-b border-line px-4 py-2.5 text-left text-[11px] font-bold tracking-[0.06em] whitespace-nowrap text-muted uppercase", className)} {...p}>
      {children}
    </th>
  );
}
export function Td({ children, className, ...p }: React.ComponentProps<"td">) {
  return (
    <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...p}>
      {children}
    </td>
  );
}

/* ───── Avatar ───── */
const AV = ["#0E7490", "#4F46E5", "#B45309", "#BE123C", "#047857", "#7C3AED"];
export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const color = AV[(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.34 }}>
      {(name || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("")}
    </div>
  );
}
