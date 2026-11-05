import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Pricing" };
type Plan = { id: string; name: string; code: string; description: string; price: number; currency: string; billingCycle: string; durationDays: number; employeeLimit: number | null; features: { key: string; label: string; included: boolean }[] };
type Pricing = { plans: Plan[]; support: { email: string; phone: string }; trialDays: number };

async function getPricing(): Promise<Pricing | null> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/public/site/plans`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

const cycleLabel = (cycle: string) => ({ yearly: "year", monthly: "month", quarterly: "quarter", half_yearly: "half-year", custom: "billing period" })[cycle] || "billing period";

export default async function PricingPage() {
  const pricing = await getPricing();
  const plans = pricing?.plans || [];
  return (
    <div className="page-pad mx-auto max-w-7xl py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center"><div className="eyebrow">Pricing</div><h1 className="mt-3 text-4xl font-bold sm:text-5xl">Plans that grow with your team.</h1><p className="mt-4 text-lg text-muted">Choose a plan or talk to us about the right setup for your company.</p></div>
      {plans.length === 0 ? (
        <Panel className="mx-auto mt-12 max-w-xl p-8 text-center"><h2 className="text-2xl font-bold">Talk to us for pricing</h2><p className="mt-2 text-muted">Our team can help you choose the right plan for your employees.</p><Button asChild className="mt-6" variant="primary"><Link href="/demo?interest=pricing">Ask about pricing</Link></Button></Panel>
      ) : (
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const popular = plans.length === 3 && index === 1;
            return <Panel key={plan.id} className={`relative flex flex-col p-6 ${popular ? "border-accent shadow-soft" : ""}`}>
              {popular && <span className="absolute -top-3 left-5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-ink">Most popular</span>}
              <h2 className="text-2xl font-bold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm text-muted">{plan.description}</p>
              <div className="mt-6 font-display text-4xl font-bold">{plan.price === 0 ? "Custom pricing" : <>{plan.currency === "INR" ? "₹" : `${plan.currency} `}{plan.price.toLocaleString("en-IN")}<span className="font-sans text-sm font-semibold text-muted"> / {cycleLabel(plan.billingCycle)}</span></>}</div>
              {plan.currency === "INR" && plan.price > 0 && <p className="mt-1 text-xs text-muted">+ GST</p>}
              <p className="mt-5 border-t border-line pt-4 text-sm font-semibold">{plan.employeeLimit ? `Up to ${plan.employeeLimit.toLocaleString("en-IN")} employees` : "Unlimited employees"}</p>
              <ul className="mt-4 flex-1 space-y-3 text-sm">{[{ key: "basic", label: "Digital cards, QR codes and basic analytics", included: true }, ...plan.features].map((feature) => <li key={feature.key} className="flex gap-2"><>{feature.included ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <X className="mt-0.5 size-4 shrink-0 text-muted" />}</><span className={feature.included ? "" : "text-muted"}>{feature.label}</span></li>)}</ul>
              <div className="mt-7 grid gap-2"><Button asChild variant="primary"><Link href={`/demo?interest=trial&plan=${encodeURIComponent(plan.name)}`}>Start free trial</Link></Button><Button asChild variant="outline"><Link href={`/demo?interest=demo&plan=${encodeURIComponent(plan.name)}`}>Book a demo</Link></Button></div>
            </Panel>;
          })}
        </div>
      )}
      <section className="mx-auto mt-16 max-w-4xl rounded-2xl border border-line bg-surface p-7 text-center"><h2 className="text-2xl font-bold">Larger team or special needs?</h2><p className="mt-2 text-muted">Tell us about your employee count, rollout and reminder needs.</p><Button asChild className="mt-5" variant="outline"><Link href="/demo?interest=pricing">Talk to Beno</Link></Button></section>
      <section className="mx-auto mt-16 max-w-3xl"><h2 className="text-2xl font-bold">Pricing questions</h2><div className="mt-5 divide-y divide-line border-y border-line">{[["Is a free trial available?", `The website offers a free trial request for teams${pricing?.trialDays ? `, with a default of ${pricing.trialDays} days` : ""}.`], ["Are prices inclusive of GST?", "INR plan prices are shown before GST."], ["Can we change plans later?", "Talk to Beno about changing the plan as your team changes."], ["Do you support larger teams?", "Yes. Use the pricing enquiry form for larger teams or special needs."]].map(([q, a]) => <details key={q} className="py-4"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>)}</div></section>
    </div>
  );
}
