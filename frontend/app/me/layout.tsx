"use client";

import { IdCard, Inbox, Pencil } from "lucide-react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

const NAV: NavItem[] = [
  { href: "/me", label: "My card", icon: IdCard, exact: true },
  { href: "/me/edit", label: "Edit my card", icon: Pencil },
  { href: "/me/enquiries", label: "My enquiries", icon: Inbox },
];

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="employee" nav={NAV} areaLabel="My digital card">
      {children}
    </AppShell>
  );
}
