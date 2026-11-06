"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/misc";

const sizes = ["1-25", "26-100", "101-500", "501-2000", "2000+"];
const initial = { name: "", email: "", phone: "", company: "", designation: "", employees: "", city: "", interest: "demo", planInterest: "", billingPreference: "yearly", message: "", consent: false, website: "" };
type FormState = typeof initial;

export function DemoForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const interest = params.get("interest");
    const plan = params.get("plan");
    const billing = params.get("billing");
    setForm((current) => ({ ...current, interest: interest && ["demo", "trial", "pricing", "sales"].includes(interest) ? interest : "demo", planInterest: plan && /^[a-z0-9-]{2,40}$/.test(plan) ? plan : "", billingPreference: billing === "monthly" || billing === "yearly" ? billing : "yearly" }));
  }, []);
  const set = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setErrors({});
    try {
      const response = await fetch("/api/public/site/demo-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const next: Record<string, string> = {};
        for (const detail of json.details || []) next[detail.field] = detail.message;
        if (Object.keys(next).length === 0) next.form = json.message || "Please check the form and try again.";
        setErrors(next); return;
      }
      setDone(true);
    } catch { setErrors({ form: "Cannot reach the server. Please try again." }); } finally { setBusy(false); }
  }
  if (done) return <Panel className="max-w-xl p-7"><h2 className="text-2xl font-bold">Thank you!</h2><p className="mt-2 text-muted">Our team will contact you within one working day.</p><Button asChild className="mt-6" variant="outline"><Link href="/">Back to home</Link></Button></Panel>;
  return <form onSubmit={submit} className="max-w-2xl space-y-5">{errors.form && <p className="rounded-lg bg-bad-soft p-3 text-sm font-semibold text-bad">{errors.form}</p>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Full name *" htmlFor="lead-name" error={errors.name}><Input id="lead-name" required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Work email *" htmlFor="lead-email" error={errors.email}><Input id="lead-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></Field><Field label="Phone" htmlFor="lead-phone" error={errors.phone}><Input id="lead-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field><Field label="Company *" htmlFor="lead-company" error={errors.company}><Input id="lead-company" required value={form.company} onChange={(e) => set("company", e.target.value)} /></Field><Field label="Designation" htmlFor="lead-designation"><Input id="lead-designation" value={form.designation} onChange={(e) => set("designation", e.target.value)} /></Field><Field label="Team size *" htmlFor="lead-employees" error={errors.employees}><Select id="lead-employees" required value={form.employees} onChange={(e) => set("employees", e.target.value)}><option value="">Select a range</option>{sizes.map((size) => <option key={size}>{size}</option>)}</Select></Field><Field label="City" htmlFor="lead-city"><Input id="lead-city" value={form.city} onChange={(e) => set("city", e.target.value)} /></Field><Field label="Plan" htmlFor="lead-plan"><Input id="lead-plan" value={form.planInterest} onChange={(e) => set("planInterest", e.target.value)} /></Field><Field label="Billing preference" htmlFor="lead-billing"><Select id="lead-billing" value={form.billingPreference} onChange={(e) => set("billingPreference", e.target.value)}><option value="yearly">Yearly</option><option value="monthly">Monthly</option></Select></Field></div><fieldset><legend className="text-[12px] font-semibold text-muted">I&apos;d like</legend><div className="mt-2 flex flex-wrap gap-3">{[["demo", "Book a demo"], ["trial", "Start a free trial"], ["pricing", "Ask about pricing"], ["sales", "Talk to sales"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="interest" value={value} checked={form.interest === value} onChange={(e) => set("interest", e.target.value)} />{label}</label>)}</div></fieldset><Field label="Message" htmlFor="lead-message"><Textarea id="lead-message" value={form.message} onChange={(e) => set("message", e.target.value)} /></Field><Checkbox label={<span>I agree to be contacted by Beno Support Technologies about Beno Card. See <Link href="/privacy" className="text-accent underline">Privacy policy</Link>.</span>} checked={form.consent} onChange={(e) => set("consent", e.target.checked)} required /><input name="website" value={form.website} onChange={(e) => set("website", e.target.value)} tabIndex={-1} aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden" autoComplete="off" /><Button type="submit" variant="primary" size="lg" loading={busy}>Send request</Button></form>;
}
