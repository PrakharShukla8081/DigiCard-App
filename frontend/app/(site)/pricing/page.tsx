import type { Metadata } from "next";
import { PricingCard, type WebsitePlan } from "@/components/site/pricing-card";
import { Testimonials } from "@/components/site/testimonials";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BillingToggle } from "@/components/site/billing-toggle";

export const metadata: Metadata = { title: "Pricing" };
type Pricing = { plans: WebsitePlan[]; groups: { name: string; subtitle: string }[]; billing: { hasMonthly: boolean; maxYearlySavingsPercent: number }; trialDays: number };

async function getPricing(): Promise<Pricing | null> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/public/site/plans`, { next: { revalidate: 300 } });
    return res.ok ? (await res.json()).data : null;
  } catch { return null; }
}

async function getTestimonials() {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/public/site/testimonials`, { next: { revalidate: 300 } });
    return res.ok ? (await res.json()).data : [];
  } catch { return []; }
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const [pricing, testimonials] = await Promise.all([getPricing(), getTestimonials()]);
  const plans = pricing?.plans || [];
  const billing = (await searchParams).billing === "monthly" ? "monthly" : "yearly";
  const groups = (pricing?.groups || []).map((group) => ({ ...group, plans: plans.filter((plan) => (plan.website?.group || "Plans") === group.name).sort((a, b) => a.sortOrder - b.sortOrder) })).filter((group) => group.plans.length).sort((a, b) => Math.min(...a.plans.map((plan) => plan.sortOrder)) - Math.min(...b.plans.map((plan) => plan.sortOrder)));
  const totalPlans = groups.reduce((count, group) => count + group.plans.length, 0);
  return <div className="page-pad mx-auto max-w-7xl py-14 sm:py-20">
    <header className="mx-auto max-w-3xl text-center"><div className="eyebrow">Pricing</div><h1 className="mt-3 text-4xl font-bold sm:text-5xl">Simple pricing for every way you work.</h1><p className="mt-4 text-lg text-muted">Start with one card or bring your whole company on brand. Prices are transparent, and custom plans are handled by a real person.</p>{pricing?.billing.hasMonthly && <BillingToggle monthly={billing === "monthly"} savings={pricing.billing.maxYearlySavingsPercent} />}</header>
    {plans.length > 0 && <section className="mt-14">
      <div className={`${totalPlans <= 4 ? "grid xl:grid-cols-4" : "block"} gap-5`}>
        {groups.map((group) => <div key={group.name} className={`mb-10 xl:mb-0 ${totalPlans <= 4 ? (group.plans.length === 1 ? "xl:col-span-1" : group.plans.length === 2 ? "xl:col-span-2" : group.plans.length === 3 ? "xl:col-span-3" : "xl:col-span-4") : ""}`}>
          <div className="mb-5"><h2 className="text-xl font-semibold">{group.name}</h2>{group.subtitle && <p className="mt-1 text-sm text-muted">{group.subtitle}</p>}<div className="mt-4 border-t border-line" /></div>
          <div className={`grid items-stretch gap-5 md:grid-cols-2 ${totalPlans <= 4 ? (group.plans.length === 1 ? "xl:grid-cols-1" : group.plans.length === 2 ? "xl:grid-cols-2" : group.plans.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4") : ""}`}>{group.plans.map((plan) => <PricingCard key={plan.id} plan={plan} billing={billing} />)}</div>
        </div>)}
      </div>
    </section>}
    {!plans.length && <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-line bg-surface p-8 text-center"><h2 className="text-2xl font-bold">Talk to us for pricing</h2><p className="mt-2 text-muted">Our team can help you choose the right plan for your employees.</p><Button asChild className="mt-6" variant="primary"><Link href="/demo?interest=pricing">Ask about pricing</Link></Button></div>}
    <section id="compare" className="mt-16 scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface"><div className="border-b border-line p-6"><h2 className="text-2xl font-bold">Compare what&apos;s included</h2><p className="mt-1 text-sm text-muted">Scroll this table on smaller screens.</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead><tr className="border-b border-line">{["Feature", ...plans.map((p) => p.name)].map((heading) => <th key={heading} className="px-5 py-4 font-bold">{heading}</th>)}</tr></thead><tbody>{Array.from(new Set(plans.flatMap((p) => p.features.map((f) => f.label)))).map((feature) => <tr key={feature} className="border-b border-line last:border-0"><th className="px-5 py-3 font-medium">{feature}</th>{plans.map((p) => <td key={p.id} className="px-5 py-3">{p.features.find((f) => f.label === feature)?.included ? "Included" : "—"}</td>)}</tr>)}</tbody></table></div></section>
    <section className="mx-auto mt-16 max-w-3xl"><h2 className="text-2xl font-bold">Pricing questions</h2><div className="mt-5 divide-y divide-line border-y border-line">{[["Is a free trial available?", `Yes. Eligible plans include a ${pricing?.trialDays || 14}-day trial request.`], ["Are prices inclusive of GST?", "INR prices are shown before GST."], ["Can we change plans later?", "Yes. Talk to Beno and we will help you change the plan as your team grows."], ["Do you support larger teams?", "Yes. Enterprise plans are tailored to your rollout, employee count and procurement needs."]].map(([q, a]) => <details key={q} className="py-4"><summary className="cursor-pointer font-bold">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>)}</div></section>
    {testimonials.length > 0 && <Testimonials items={testimonials} />}
    <section className="mx-auto mt-16 max-w-4xl rounded-2xl bg-fg p-8 text-center text-white"><h2 className="text-2xl font-bold">Not sure where to start?</h2><p className="mt-2 text-white/75">Tell us about your team and we&apos;ll recommend a practical rollout.</p><Button asChild className="mt-5" variant="outline"><Link href="/demo?interest=pricing">Talk to Beno</Link></Button></section>
  </div>;
}
