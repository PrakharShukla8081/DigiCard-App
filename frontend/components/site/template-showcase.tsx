"use client";

import { useEffect, useState } from "react";
import type { CardPayload } from "@/lib/types";
import { CardView } from "@/components/card/card-view";
import { PhoneFrame } from "@/components/card/phone-frame";
import { Chip } from "@/components/ui/misc";

const SAMPLE: CardPayload = {
  url: "https://example.com/c/veltrix-engineering/rahul-sharma",
  orgSlug: "veltrix-engineering",
  slug: "rahul-sharma",
  template: "classic",
  sections: { about: true, contact: true, social: true, products: true, gallery: false, videos: false, companyInfo: true, enquiry: true, qr: true },
  employee: { name: "Rahul Sharma", firstName: "Rahul", designation: "Senior Sales Manager", department: "Sales", email: "rahul@example.com", mobile: "+919876543210", whatsapp: "+919876543210", photoUrl: "", bio: "Helping engineering teams find practical solutions for their next project.", location: "Pune, India", website: "veltrix.example" },
  social: { linkedin: "linkedin.com/in/rahul-sharma" },
  company: { name: "Veltrix Engineering", privacyPolicyUrl: "", logoUrl: "", primaryColor: "#4F46E5", secondaryColor: "#10B981", description: "", tagline: "", website: "veltrix.example", email: "", phone: "", address: "", qr: { foreground: "#111827", background: "#FFFFFF", useLogo: true, frame: "none", frameText: "Scan to save my contact" } },
  verified: { isVerified: false, verifiedAt: null },
  content: { products: [{ id: "sample-1", title: "Industrial automation", description: "Practical systems for growing teams.", imageUrl: "", url: "" }, { id: "sample-2", title: "Engineering support", description: "Advice from first brief to delivery.", imageUrl: "", url: "" }], gallery: [], videos: [] },
  poweredBy: "Beno Digital Card",
};

const COLOURS = [
  ["Indigo", "#4F46E5", "#10B981"],
  ["Ocean", "#0369A1", "#06B6D4"],
  ["Plum", "#7E22CE", "#EC4899"],
  ["Forest", "#166534", "#84CC16"],
];
const TEMPLATES = ["classic", "modern", "executive", "minimal"] as const;

export function TemplateShowcase() {
  const [templateIndex, setTemplateIndex] = useState(0);
  const [colours, setColours] = useState(COLOURS[0]);
  const [paused, setPaused] = useState(false);
  const template = TEMPLATES[templateIndex];
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setTemplateIndex((current) => (current + 1) % TEMPLATES.length), 4000);
    return () => window.clearInterval(timer);
  }, [paused]);
  const card = { ...SAMPLE, template, company: { ...SAMPLE.company, primaryColor: colours[1], secondaryColor: colours[2] } };
  return (
    <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className="mb-3 flex items-center justify-between gap-3"><span className="eyebrow">Live preview — sample card</span><Chip tone="accent" dot={false}>Fictional example</Chip></div>
      <div className="hero-phone relative">
        <div className="hero-phone-glow" aria-hidden />
        <div className="hero-card relative">
          <PhoneFrame><div key={template} className="hero-card-crossfade"><CardView card={card} mode="preview" /></div></PhoneFrame>
        </div>
        <ActivityToasts />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Card template">
        {TEMPLATES.map((item, index) => <button key={item} type="button" className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${template === item ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`} onClick={() => { setTemplateIndex(index); setPaused(true); }}>{item}</button>)}
        {COLOURS.map((item) => <button key={item[0]} type="button" aria-label={`${item[0]} colour preset`} className={`size-7 rounded-full border-2 ${colours[0] === item[0] ? "border-fg" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${item[1]} 50%, ${item[2]} 50%)` }} onClick={() => setColours(item)} />)}
      </div>
    </div>
  );
}

function ActivityToasts() {
  const items = ["Card opened via QR", "Contact saved", "WhatsApp tapped", "New enquiry"];
  return <div className="pointer-events-none absolute right-0 top-24 z-10 hidden w-44 space-y-2 md:block" aria-label="Sample activity">
    <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-muted">Sample activity</div>
    {items.map((item, index) => <div key={item} className="marketing-toast rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold shadow-soft" style={{ animationDelay: `${index * 2.5}s` }}>{item}</div>)}
  </div>;
}
