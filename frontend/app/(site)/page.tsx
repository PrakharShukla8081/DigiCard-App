import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  Building2,
  Check,
  ClipboardList,
  FileSpreadsheet,
  Layers,
  LockKeyhole,
  MessageCircle,
  Palette,
  QrCode,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";
import { TemplateShowcase } from "@/components/site/template-showcase";

export const metadata: Metadata = {
  title: "Digital visiting cards for teams",
  description: "Manage every employee's digital visiting card, brand, links and usage in one place.",
};

const audiences = [
  {
    icon: Building2,
    title: "For your company",
    items: ["Bulk upload with an error report", "Brand once for every card", "Analytics and leaderboard", "Email and WhatsApp reminders", "Plan seats and audit log"],
  },
  {
    icon: UserRound,
    title: "For employees",
    items: ["Own login and allowed-field editing", "Photo and profile details", "WhatsApp and email signature sharing", "Zoom/Teams background and QR download", "A permanent card link"],
  },
  {
    icon: Smartphone,
    title: "For your customers",
    items: ["One-tap Call, WhatsApp and Email", "Save contact in one tap", "Products, gallery and videos", "Enquiry form when enabled", "A card that works in any browser"],
  },
];

const faqs = [
  ["Do employees need an app?", "No. Cards and the management experience work in a browser."],
  ["Can we upload our existing employee list?", "Yes. Company admins can upload an Excel or CSV file and receive row-level errors for rows that need attention."],
  ["What happens when an employee leaves?", "The company admin can deactivate the employee card and their access."],
  ["Do printed QR codes keep working after changes?", "Yes. Editing a profile does not change its permanent card link."],
  ["Can employees change their own details?", "Only fields that the company admin allows can be edited by an employee."],
  ["Is WhatsApp/email reminder included?", "Email and WhatsApp reminders depend on the plan and the company's enabled reminder settings."],
  ["How is pricing calculated?", "Pricing is based on the plan selected by your company and its employee limit. Contact Beno for the current options."],
  ["Is our data separate from other companies?", "Yes. Company data is isolated at both API and database levels."],
];

const facts = [
  "Upload up to 20,000 employees from one Excel file",
  "4 card designs in your brand colours",
  "Permanent link + QR code for every employee",
  "Adoption reminders on email & WhatsApp",
];

export default function Home() {
  return (
    <>
      <section className="page-pad mx-auto grid max-w-7xl items-center gap-12 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
        <div>
          <div className="eyebrow">Digital visiting cards for teams</div>
          <h1 className="mt-4 max-w-3xl text-[42px] leading-[1.03] font-bold sm:text-[62px]">Every employee&apos;s visiting card. One place to manage them all.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">Upload your team from Excel, apply your brand once, share cards by link, QR or WhatsApp, and track how they are used.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="primary"><Link href="/demo">Book a free demo</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/pricing">See pricing</Link></Button>
          </div>
          <p className="mt-4 text-sm font-semibold text-muted">Free trial for teams · Setup in a day · Made for Indian businesses</p>
        </div>
        <TemplateShowcase />
      </section>

      <section className="page-pad border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-5 py-7 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => <div key={fact} className="flex items-start gap-3 text-sm font-semibold"><Check className="mt-0.5 size-5 shrink-0 text-ok" />{fact}</div>)}
        </div>
      </section>

      <section className="page-pad mx-auto grid max-w-7xl gap-10 py-20 lg:grid-cols-[.8fr_1.2fr]">
        <div>
          <div className="eyebrow">The old way adds friction</div>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Paper visiting cards cost more than you think.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Reprinting never ends", "Titles and phone numbers change. Beno Card lets your team update the digital profile without reprinting."],
            ["Contacts get lost", "Give customers one card with direct actions, products and an enquiry form."],
            ["Usage stays invisible", "See measurable activity such as views, shares, contact saves and button taps."],
          ].map(([title, body]) => <Panel key={title} className="p-5"><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-sm text-muted">{body}</p></Panel>)}
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-surface">
        <div className="page-pad mx-auto max-w-7xl py-20">
          <div className="max-w-2xl"><div className="eyebrow">One card system for everyone</div><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Useful to the people who create, share and receive a card.</h2></div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {audiences.map((audience) => <Panel key={audience.title} className="p-6"><audience.icon className="size-7 text-accent" /><h3 className="mt-4 text-xl font-bold">{audience.title}</h3><ul className="mt-5 space-y-3 text-sm text-muted">{audience.items.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ok" />{item}</li>)}</ul></Panel>)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="page-pad mx-auto max-w-7xl scroll-mt-20 py-20">
        <div className="eyebrow">How it works</div><h2 className="mt-3 text-3xl font-bold sm:text-4xl">From spreadsheet to shared cards.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[["01", "Beno sets up your company account", "We configure your company space and card basics."], ["02", "Upload your team and set your brand", "Import your people, choose your colours and select a card design."], ["03", "Share cards and track results", "Employees share their cards while admins see measurable activity."]].map(([number, title, body]) => <Panel key={number} className="p-6"><span className="font-display text-4xl font-bold text-accent">{number}</span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm text-muted">{body}</p></Panel>)}
        </div>
      </section>

      <section className="page-pad bg-surface">
        <div className="mx-auto grid max-w-7xl gap-10 py-20 lg:grid-cols-[.9fr_1.1fr]">
          <div><div className="eyebrow">Numbers you can trust</div><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Measure actions, not assumptions.</h2><p className="mt-4 text-muted">Beno Card reports what the system can observe. A WhatsApp tap is counted as a tap, not as a conversation.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{["Views", "Unique visitors per day", "Shares", "Contact saves", "QR visits", "Button taps", "Enquiries"].map((item) => <div key={item} className="rounded-xl border border-line bg-bg p-4 text-sm font-semibold"><BarChart3 className="mb-3 size-5 text-accent" />{item}</div>)}</div>
        </div>
      </section>

      <section className="page-pad mx-auto max-w-7xl py-20">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Company isolation", body: "Each company's data is isolated at API and database level.", Icon: LockKeyhole },
            { title: "Role-based access", body: "Super Admin, Company Admin and Employee access is separated.", Icon: Users },
            { title: "Audit log", body: "Platform and company actions can be reviewed in an audit trail.", Icon: ClipboardList },
            { title: "Protected secrets", body: "Third-party secrets are encrypted and tokens are hashed.", Icon: ShieldCheck },
          ].map(({ title, body, Icon }) => <Panel key={title} className="p-5"><Icon className="size-6 text-accent" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm text-muted">{body}</p></Panel>)}
        </div>
      </section>

      <section className="page-pad">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 rounded-3xl bg-accent px-6 py-10 text-accent-ink sm:flex-row sm:items-center sm:px-10"><div><div className="eyebrow text-accent-ink/70">Plans for your team</div><h2 className="mt-2 text-3xl font-bold">Start with the plan that fits your company.</h2></div><Button asChild variant="outline" className="border-accent-ink/40 bg-transparent text-accent-ink hover:bg-accent-ink/10"><Link href="/pricing">See pricing</Link></Button></div>
      </section>

      <section id="faq" className="page-pad mx-auto max-w-3xl scroll-mt-20 py-20">
        <div className="text-center"><div className="eyebrow">FAQ</div><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Questions, answered.</h2></div>
        <div className="mt-8 divide-y divide-line border-y border-line">{faqs.map(([question, answer]) => <details key={question} className="group py-4"><summary className="cursor-pointer list-none pr-6 font-bold marker:hidden">{question}<span className="float-right text-accent group-open:rotate-45">+</span></summary><p className="mt-3 max-w-2xl text-sm text-muted">{answer}</p></details>)}</div>
      </section>

      <section className="page-pad pb-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 rounded-3xl border border-line bg-surface p-8 sm:flex-row sm:items-center sm:p-10"><div><h2 className="text-3xl font-bold">Give your team cards they&apos;ll actually share.</h2><p className="mt-2 text-muted">See how Beno Card can work for your company.</p></div><div className="flex flex-wrap gap-3"><Button asChild variant="primary"><Link href="/demo">Book a demo</Link></Button><Button asChild variant="outline"><Link href="/demo?interest=trial">Request a free trial</Link></Button></div></div>
      </section>
    </>
  );
}
