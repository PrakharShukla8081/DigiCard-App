"use client";

import { BarChart3, Bell, CreditCard, FileSpreadsheet, FileText, Images, Inbox, LayoutDashboard, Palette, UserCog, Users } from "lucide-react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/employees", label: "Employees & cards", icon: Users },
  { href: "/admin/import", label: "Bulk upload", icon: FileSpreadsheet, feature: "bulkUpload" },
  { href: "/admin/branding", label: "Branding & card design", icon: Palette },
  { href: "/admin/content", label: "Products, gallery, videos", icon: Images, feature: "productsGallery" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/enquiries", label: "Enquiries", icon: Inbox },
  { href: "/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/admin/team", label: "Admin team", icon: UserCog },
  { href: "/admin/subscription", label: "Subscription", icon: CreditCard },
  { href: "/admin/audit", label: "Audit log", icon: FileText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell role="company_admin" nav={NAV} areaLabel="Company Admin">
      {children}
    </AppShell>
  );
}
