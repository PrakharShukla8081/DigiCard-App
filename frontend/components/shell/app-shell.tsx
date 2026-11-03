"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, homeFor } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PageLoader, Avatar, SubStatusChip } from "@/components/ui/misc";
import { Logo } from "./logo";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; feature?: string };

/**
 * Authenticated layout: role guard + sidebar (drawer on phones) + top bar.
 * The role check here is for navigation only — the backend enforces access on every request.
 */
export function AppShell({ role, nav, children, areaLabel }: { role: "super_admin" | "company_admin" | "employee"; nav: NavItem[]; children: React.ReactNode; areaLabel: string }) {
  const { session, loading, logout, hasFeature } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (session.user.role !== role) router.replace(homeFor(session.user.role));
  }, [loading, session, role, router, pathname]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !session || session.user.role !== role) return <PageLoader />;

  const org = session.organization;
  const sub = session.subscription;
  const items = nav.filter((n) => !n.feature || hasFeature(n.feature));
  const isOn = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));

  const sidebar = (
    <nav aria-label={areaLabel} className="flex h-full flex-col gap-1 p-3">
      <div className="flex items-center justify-between px-2 py-2">
        <Link href={homeFor(role)} className="flex items-center gap-2.5">
          <Logo />
        </Link>
        <button className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      {org && (
        <div className="mx-1 mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
          ) : (
            <div className="size-9 shrink-0 rounded-lg" style={{ background: org.primaryColor || "var(--accent)" }} />
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold">{org.name}</div>
            <div className="truncate text-[11px] text-muted">{sub?.planName || "No plan"}</div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isOn(n) ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-fg", isOn(n) && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent")}
          >
            <n.icon className="size-[17px] shrink-0" />
            {n.label}
          </Link>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
        <Link href="/account" className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-fg">
          <KeyRound className="size-[17px]" />
          Account &amp; password
        </Link>
        <button onClick={logout} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2 text-left font-semibold text-muted hover:bg-surface-2 hover:text-fg">
          <LogOut className="size-[17px]" />
          Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-bg lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#0b0f1a]/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85%] overflow-y-auto bg-bg shadow-2xl">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="page-pad mx-auto flex h-14 max-w-[1320px] items-center gap-3">
            <button className="-ml-1 rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <span className="hidden text-[13px] font-semibold text-muted lg:inline">{areaLabel}</span>
            <div className="ml-auto flex items-center gap-3">
              {sub && role !== "super_admin" && !sub.active && <SubStatusChip status={sub.status} />}
              <div className="hidden text-right sm:block">
                <div className="text-[13px] leading-tight font-bold">{session.user.name}</div>
                <div className="text-[11px] text-muted">{session.user.email}</div>
              </div>
              <Avatar name={session.user.name} size={34} />
            </div>
          </div>
        </header>
        {sub && role !== "super_admin" && !sub.active && (
          <div className="border-b border-warn/30 bg-warn-soft">
            <p className="page-pad mx-auto max-w-[1320px] py-2 text-[13px] font-semibold text-warn">
              Your subscription is {sub.status === "none" ? "not set up" : sub.status}. You can view data, but changes are paused and public cards are offline. Contact Beno to renew.
            </p>
          </div>
        )}
        <main className="page-pad mx-auto max-w-[1320px] pt-6 pb-16">{children}</main>
      </div>
    </div>
  );
}
