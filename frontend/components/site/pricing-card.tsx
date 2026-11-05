import Link from "next/link";
import { Building2, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WebsitePlan = {
  id: string;
  name: string;
  code: string;
  description: string;
  price: number | null;
  currency: "INR" | "USD";
  billingCycle: string;
  employeeLimit: number | null;
  sortOrder: number;
  features: { key: string; label: string; included: boolean }[];
  website?: {
    group?: string;
    groupSubtitle?: string;
    userRangeLabel?: string;
    description?: string;
    badge?: string;
    featured?: boolean;
    priceMode?: "price" | "per_user" | "custom";
    showMonthlyEquivalent?: boolean;
    monthlyPrice?: number;
    freeLabel?: string;
    priceSuffix?: string;
    priceNote?: string;
    ctaType?: "trial" | "demo" | "contact_sales";
    ctaLabel?: string;
    ctaNote?: string;
    inheritsLabel?: string;
    featureGroups?: { title: string; items: string[] }[];
  };
};

const symbol = (currency: WebsitePlan["currency"]) => (currency === "INR" ? "₹" : "$");
const formatPrice = (price: number, currency: WebsitePlan["currency"]) =>
  `${symbol(currency)}${price.toLocaleString(currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 0 })}`;

export function PricingCard({ plan, billing = "yearly" }: { plan: WebsitePlan; billing?: "monthly" | "yearly"; preview?: boolean }) {
  const website = plan.website || {};
  const mode = website.priceMode || "price";
  const featured = Boolean(website.featured);
  const yearlyPrice = plan.price === null ? null : plan.price;
  const monthlyPrice = website.monthlyPrice ?? (yearlyPrice !== null && website.showMonthlyEquivalent ? yearlyPrice / 12 : null);
  const showMonthly = billing === "monthly" && website.monthlyPrice !== undefined && mode !== "custom" && plan.price !== 0;
  const interest = website.ctaType === "contact_sales" ? "sales" : website.ctaType || "demo";
  const href = `/demo?plan=${encodeURIComponent(plan.code)}&interest=${interest}&billing=${billing}`;
  const groups = website.featureGroups?.length ? website.featureGroups : [{ title: "Included", items: plan.features.filter((feature) => feature.included).map((feature) => feature.label) }];
  const isOneUser = website.userRangeLabel?.trim() === "1 user";
  const muted = featured ? "text-white/75" : "text-muted";

  return (
    <article className={`relative flex h-full flex-col rounded-2xl border p-6 shadow-soft ${featured ? "border-transparent bg-gradient-to-br from-indigo-600 to-purple-700 text-white" : "border-line bg-surface"}`}>
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold">{plan.name}</h2>
          {website.badge && <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${featured ? "bg-white text-indigo-700" : "bg-accent text-accent-ink"}`}>{website.badge}</span>}
        </div>
        <div className={`mt-3 flex items-center gap-2 text-sm ${muted}`}>
          {isOneUser ? <User className="size-4" aria-hidden="true" /> : <Building2 className="size-4" aria-hidden="true" />}
          <span>{website.userRangeLabel || "Team plan"}</span>
        </div>
      </header>

      <div className={`my-5 border-t ${featured ? "border-white/25" : "border-line"}`} />

      <div>
        {mode === "custom" ? (
          <div className="font-display text-4xl font-bold">Custom</div>
        ) : plan.price === 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold">Free</span>
            {website.freeLabel && <span className={`text-sm ${muted}`}>{website.freeLabel}</span>}
          </div>
        ) : (showMonthly || (billing === "yearly" && website.showMonthlyEquivalent && monthlyPrice !== null)) ? (
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold transition-opacity duration-150 motion-reduce:transition-none">{formatPrice(showMonthly ? monthlyPrice! : yearlyPrice! / 12, plan.currency)}</span>
            <span className={`text-sm ${muted}`}>{mode === "per_user" ? "per user/month" : "per month"}</span>
          </div>
        ) : (
          <div className="font-display text-4xl font-bold">{yearlyPrice === null ? "Custom" : formatPrice(yearlyPrice, plan.currency)}</div>
        )}
        {showMonthly && <p className={`mt-2 text-xs ${muted}`}>Billed monthly, plus applicable taxes</p>}
        {!showMonthly && website.showMonthlyEquivalent && yearlyPrice !== null && monthlyPrice !== null && <p className={`mt-2 text-xs ${muted}`}>{formatPrice(yearlyPrice, plan.currency)}{mode === "per_user" ? " per user/year" : " billed yearly"}, plus applicable taxes</p>}
        {plan.price === 0 && mode === "price" && website.priceNote && <p className={`mt-2 text-xs ${muted}`}>{website.priceNote}</p>}
        {mode !== "custom" && monthlyPrice === null && plan.price !== 0 && website.priceSuffix && <p className={`mt-2 text-xs ${muted}`}>{website.priceSuffix}</p>}
        {mode === "custom" && website.priceNote && <p className={`mt-2 text-xs ${muted}`}>{website.priceNote}</p>}
      </div>

      <p className={`mt-5 text-sm leading-6 ${muted}`}>{website.description || plan.description}</p>

      <div className="mt-6">
        <Button asChild variant="outline" className={`w-full ${featured ? "border-white bg-white text-indigo-700 hover:bg-white/90 hover:text-indigo-800" : website.ctaType === "trial" ? "border-accent text-accent hover:bg-accent-soft" : ""}`}>
          <Link href={href}>{website.ctaLabel || (website.ctaType === "contact_sales" ? "Talk to sales" : website.ctaType === "demo" ? "Book a demo" : "Start free trial")}</Link>
        </Button>
        {website.ctaNote && <p className={`mt-2 text-center text-xs ${muted}`}>{website.ctaNote}</p>}
      </div>

      <div className={`my-5 border-t ${featured ? "border-white/25" : "border-line"}`} />
      {website.inheritsLabel && <p className="text-sm font-semibold">{website.inheritsLabel}</p>}
      <div className="mt-4 flex-1 space-y-4">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-bold">{group.title}</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {group.items.map((rawItem) => {
                const comingSoon = rawItem.endsWith(" (coming soon)");
                const item = comingSoon ? rawItem.slice(0, -" (coming soon)".length) : rawItem;
                return <li key={rawItem} className={`flex items-start gap-2 ${comingSoon ? muted : ""}`}>
                  {comingSoon ? <span className={`mt-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-none ${featured ? "border-white/40" : "border-line"}`}>Soon</span> : <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  <span>{item}</span>
                </li>;
              })}
            </ul>
          </div>
        ))}
      </div>
      <Link href="#compare" className={`mt-6 text-sm font-semibold underline underline-offset-4 ${featured ? "text-white" : "text-accent"}`}>Compare plans</Link>
    </article>
  );
}
