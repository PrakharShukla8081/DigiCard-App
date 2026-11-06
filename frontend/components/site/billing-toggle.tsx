"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function BillingToggle({ monthly, savings }: { monthly: boolean; savings: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const yearly = !monthly;
  function setBilling(value: "monthly" | "yearly") {
    const next = new URLSearchParams(params.toString());
    if (value === "yearly") next.delete("billing");
    else next.set("billing", value);
    router.replace(`/pricing${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  }
  return <div className="mt-7 flex items-center justify-center gap-3 text-sm font-semibold">
    <span>{monthly ? "Billed monthly" : "Billed yearly"}</span>
    <button type="button" role="switch" aria-checked={yearly} aria-label="Toggle yearly billing" onClick={() => setBilling(yearly ? "monthly" : "yearly")} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setBilling(yearly ? "monthly" : "yearly"); } }} className={`relative box-border h-6 w-11 rounded-full border transition-colors ${yearly ? "border-accent bg-accent" : "border-line bg-surface-2"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${yearly ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
    {savings > 0 && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent">up to {savings}% off</span>}
  </div>;
}
