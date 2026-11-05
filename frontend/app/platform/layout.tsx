"use client";

import { Building2, CreditCard, FileText, Inbox, Layers, LayoutDashboard, MessageSquareQuote, Settings } from "lucide-react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

const NAV: NavItem[] = [
  { href: "/platform", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/platform/organizations", label: "Companies", icon: Building2 },
  { href: "/platform/leads", label: "Website leads", icon: Inbox },
  { href: "/platform/testimonials", label: "Testimonials", icon: MessageSquareQuote },
  { href: "/platform/plans", label: "Plans", icon: Layers },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/platform/audit", label: "Audit log", icon: FileText },
  { href: "/platform/settings", label: "Platform settings", icon: Settings },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="super_admin" nav={NAV} areaLabel="Beno Super Admin">
      {children}
    </AppShell>
  );
}
