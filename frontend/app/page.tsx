import Link from "next/link";
import { BarChart3, Bell, FileSpreadsheet, Palette, QrCode, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: FileSpreadsheet, title: "Bulk upload", body: "Import thousands of employees from one Excel or CSV file, with row-level error reports." },
  { icon: Palette, title: "Your brand on every card", body: "Logo, colours and template are set once by the company and applied to every card." },
  { icon: QrCode, title: "Permanent links & QR", body: "Each employee gets a stable card link and QR code that keep working after profile edits." },
  { icon: BarChart3, title: "Real usage analytics", body: "Views, shares, contact saves, QR visits and enquiries — only what can be measured." },
  { icon: Bell, title: "Adoption reminders", body: "Scheduled email and WhatsApp nudges for employees who haven't activated or shared their card." },
  { icon: ShieldCheck, title: "Isolated & secure", body: "Every company's data is separated at the API and database level, with role-based access." },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="page-pad mx-auto flex h-16 max-w-6xl items-center justify-between">
        <Logo />
        <Button asChild variant="primary">
          <Link href="/login">Log in</Link>
        </Button>
      </header>
      <main className="page-pad mx-auto max-w-6xl pt-10 pb-20">
        <section className="max-w-3xl">
          <div className="eyebrow">Beno Support Technologies</div>
          <h1 className="mt-3 text-[40px] leading-[1.08] font-bold sm:text-[52px]">Digital visiting cards for your whole company.</h1>
          <p className="mt-4 max-w-2xl text-[17px] text-muted">
            Beno Digital Card gives every employee a professional, mobile-first visiting card — and gives your admins one place to manage branding, people, analytics and adoption.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/login">Log in to your account</Link>
            </Button>
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
      </main>
    </div>
  );
}
