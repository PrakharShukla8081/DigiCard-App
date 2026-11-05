"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [session] = useState(() => typeof document !== "undefined" && document.cookie.includes("bdc_session="));
  const dashboardLabel = session ? "Open dashboard" : "Log in";
  const dashboardHref = session ? "/platform" : "/login";

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/95 backdrop-blur">
      <div className="page-pad mx-auto flex h-16 max-w-7xl items-center justify-between">
        <Link href="/" aria-label="Beno Card home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-semibold text-muted hover:text-fg">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost">
            <Link href={dashboardHref}>{dashboardLabel}</Link>
          </Button>
          <Button asChild variant="primary">
            <Link href="/demo">Book a demo</Link>
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav className="page-pad border-t border-line bg-bg py-3 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2.5 font-semibold hover:bg-surface-2" onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href={dashboardHref} className="rounded-lg px-3 py-2.5 font-semibold hover:bg-surface-2" onClick={() => setOpen(false)}>
              {dashboardLabel}
            </Link>
            <Button asChild variant="primary" className="mt-1">
              <Link href="/demo" onClick={() => setOpen(false)}>
                Book a demo
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
