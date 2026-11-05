import type { Metadata } from "next";
import { DemoForm } from "@/components/site/demo-form";

export const metadata: Metadata = { title: "Book a demo" };
export default function DemoPage() {
  return <div className="page-pad mx-auto grid max-w-7xl gap-12 py-14 lg:grid-cols-[1fr_.7fr] lg:py-20"><div><div className="eyebrow">Get started</div><h1 className="mt-3 text-4xl font-bold sm:text-5xl">See what Beno Card can do for your team.</h1><p className="mt-4 max-w-xl text-lg text-muted">Tell us a little about your company and we&apos;ll help you choose the right next step.</p><div className="mt-8"><DemoForm /></div></div><aside className="h-fit rounded-2xl border border-line bg-surface p-6"><h2 className="text-xl font-bold">What happens next</h2><ol className="mt-6 space-y-6">{["We call you within one working day", "30-minute demo with your logo and colours", "We set up your company account and you upload your team"].map((item, index) => <li key={item} className="flex gap-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{index + 1}</span><span className="pt-1 text-sm font-semibold">{item}</span></li>)}</ol></aside></div>;
}
