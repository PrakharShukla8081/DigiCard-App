import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bell, FileSpreadsheet, Palette, QrCode, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Digital visiting cards for teams",
  description: "Manage every employee's digital visiting card, brand, links and usage in one place.",
};

const FEATURES = [
  { icon: FileSpreadsheet, title: "Bulk upload", body: "Import employees from one Excel or CSV file, with row-level error reports." },
  { icon: Palette, title: "Your brand on every card", body: "Set your logo, colours and template once for the whole company." },
  { icon: QrCode, title: "Permanent links & QR", body: "Every employee gets a stable card link and QR code." },
  { icon: BarChart3, title: "Real usage analytics", body: "See views, shares, contact saves, QR visits and enquiries." },
  { icon: Bell, title: "Adoption reminders", body: "Send scheduled email and WhatsApp nudges to employees." },
  { icon: ShieldCheck, title: "Isolated & secure", body: "Company data is separated at the API and database level." },
];

export default function Home() {
  return (
    <div className="page-pad mx-auto max-w-7xl py-16">
      <section className="max-w-3xl">
        <div className="eyebrow">Beno Support Technologies</div>
        <h1 className="mt-3 text-[40px] leading-[1.08] font-bold sm:text-[52px]">Digital visiting cards for your whole company.</h1>
        <p className="mt-4 max-w-2xl text-[17px] text-muted">Beno Digital Card gives every employee a professional, mobile-first visiting card — and gives admins one place to manage branding, people, analytics and adoption.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="primary" size="lg"><Link href="/demo">Book a free demo</Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/pricing">See pricing</Link></Button>
        </div>
      </section>
      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
            <f.icon className="size-6 text-accent" />
            <h2 className="mt-3 text-lg font-bold">{f.title}</h2>
            <p className="mt-1 text-[14px] text-muted">{f.body}</p>
          </div>
        ))}
      </section>
      <div className="mt-10 flex items-center gap-2 text-sm text-muted"><Logo compact /> <span>Made for teams that want cards people actually share.</span></div>
    </div>
  );
}
