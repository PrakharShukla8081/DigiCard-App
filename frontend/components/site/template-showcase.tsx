"use client";

import { useState } from "react";
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
  company: { name: "Veltrix Engineering", logoUrl: "", primaryColor: "#4F46E5", secondaryColor: "#10B981", description: "", tagline: "", website: "veltrix.example", email: "", phone: "", address: "" },
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
  const [template, setTemplate] = useState<CardPayload["template"]>("classic");
  const [colours, setColours] = useState(COLOURS[0]);
  const card = { ...SAMPLE, template, company: { ...SAMPLE.company, primaryColor: colours[1], secondaryColor: colours[2] } };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3"><span className="eyebrow">Live preview — sample card</span><Chip tone="accent" dot={false}>Fictional example</Chip></div>
      <PhoneFrame><CardView card={card} mode="preview" /></PhoneFrame>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Card template">
        {TEMPLATES.map((item) => <button key={item} type="button" className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${template === item ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`} onClick={() => setTemplate(item)}>{item}</button>)}
        {COLOURS.map((item) => <button key={item[0]} type="button" aria-label={`${item[0]} colour preset`} className={`size-7 rounded-full border-2 ${colours[0] === item[0] ? "border-fg" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${item[1]} 50%, ${item[2]} 50%)` }} onClick={() => setColours(item)} />)}
      </div>
    </div>
  );
}
