"use client";

import { useMemo } from "react";
import type { Plan } from "@/lib/types";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export type SubForm = {
  planId: string;
  status: string;
  startDate: string;
  endDate: string;
  employeeLimitOverride: string;
  priceOverride: string;
  notes: string;
  paymentReference: string;
  featureOverrides: Record<string, "plan" | "on" | "off">;
};

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

export function emptySub(plans: Plan[]): SubForm {
  const p = plans.find((x) => x.isActive) || plans[0];
  const start = today();
  return {
    planId: p?._id || "",
    status: "active",
    startDate: start,
    endDate: p ? addDays(start, p.durationDays) : addDays(start, 365),
    employeeLimitOverride: "",
    priceOverride: "",
    notes: "",
    paymentReference: "",
    featureOverrides: {},
  };
}

/** Convert the form into the API body. */
export function subBody(f: SubForm, includePlan = true) {
  const overrides: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(f.featureOverrides)) if (v !== "plan") overrides[k] = v === "on";
  return {
    ...(includePlan ? { planId: f.planId } : {}),
    status: f.status,
    startDate: f.startDate,
    endDate: f.endDate,
    employeeLimitOverride: f.employeeLimitOverride ? Number(f.employeeLimitOverride) : null,
    priceOverride: f.priceOverride ? Number(f.priceOverride) : null,
    notes: f.notes,
    paymentReference: f.paymentReference,
    featureOverrides: overrides,
  };
}

export function SubscriptionFields({ value, onChange, plans, features, lockPlan = false }: { value: SubForm; onChange: (v: SubForm) => void; plans: Plan[]; features: Record<string, string>; lockPlan?: boolean }) {
  const plan = useMemo(() => plans.find((p) => p._id === value.planId), [plans, value.planId]);
  const planLimit = plan?.employeeLimit ?? null;
  const customLimit = value.employeeLimitOverride ? Number(value.employeeLimitOverride) : null;
  const set = (patch: Partial<SubForm>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Plan" htmlFor="sub-plan" className="sm:col-span-2" hint={plan ? `${plan.currency} ${plan.price.toLocaleString("en-IN")} · ${plan.billingCycle} · ${plan.employeeLimit ? plan.employeeLimit.toLocaleString("en-IN") + " employees" : "unlimited employees"}` : undefined}>
        <Select
          id="sub-plan"
          value={value.planId}
          disabled={lockPlan}
          onChange={(e) => {
            const p = plans.find((x) => x._id === e.target.value);
            set({ planId: e.target.value, endDate: p ? addDays(value.startDate, p.durationDays) : value.endDate });
          }}
        >
          {plans.map((p) => (
            <option key={p._id} value={p._id} disabled={!p.isActive}>
              {p.name}
              {!p.isActive ? " (inactive)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="sub-status">
        <Select id="sub-status" value={value.status} onChange={(e) => set({ status: e.target.value })}>
          {["trial", "active", "suspended", "cancelled", "expired"].map((s) => (
            <option key={s} value={s}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Custom employee limit (optional)"
        htmlFor="sub-limit"
        hint={`Leave empty to use the plan limit (${planLimit == null ? "unlimited" : `${planLimit.toLocaleString("en-IN")} employees`})`}
      >
        <div className="flex items-center gap-2">
          <Input id="sub-limit" type="number" min={1} value={value.employeeLimitOverride} onChange={(e) => set({ employeeLimitOverride: e.target.value })} placeholder={planLimit == null ? "Unlimited" : String(planLimit)} />
          {value.employeeLimitOverride && <Button type="button" size="sm" variant="ghost" onClick={() => set({ employeeLimitOverride: "" })}>Use plan limit</Button>}
        </div>
        {planLimit != null && customLimit != null && customLimit < planLimit && <p className="mt-1 text-[12px] text-warn">This company will get only {customLimit} seats instead of the plan&apos;s {planLimit}.</p>}
      </Field>
      <Field label="Start date" htmlFor="sub-start">
        <Input id="sub-start" type="date" value={value.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: plan ? addDays(e.target.value, plan.durationDays) : value.endDate })} />
      </Field>
      <Field label="End date" htmlFor="sub-end">
        <Input id="sub-end" type="date" value={value.endDate} min={value.startDate} onChange={(e) => set({ endDate: e.target.value })} />
      </Field>
      <Field label="Agreed price (optional)" htmlFor="sub-price" hint="If different from the plan price">
        <Input id="sub-price" type="number" min={0} value={value.priceOverride} onChange={(e) => set({ priceOverride: e.target.value })} />
      </Field>
      <Field label="Payment / invoice reference" htmlFor="sub-ref" hint="Manual billing for now">
        <Input id="sub-ref" value={value.paymentReference} onChange={(e) => set({ paymentReference: e.target.value })} placeholder="e.g. INV-2026-014" />
      </Field>
      <div className="sm:col-span-2">
        <div className="eyebrow mb-2">Feature overrides for this company</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(features).map(([k, label]) => {
            const v = value.featureOverrides[k] || "plan";
            const inPlan = Boolean(plan?.features?.[k]);
            return (
              <div key={k} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <span className="min-w-0 text-[13px]">{label}</span>
                <Select className="h-8 w-[118px] shrink-0 text-[12px]" value={v} aria-label={label} onChange={(e) => set({ featureOverrides: { ...value.featureOverrides, [k]: e.target.value as "plan" | "on" | "off" } })}>
                  <option value="plan">Plan ({inPlan ? "on" : "off"})</option>
                  <option value="on">Force on</option>
                  <option value="off">Force off</option>
                </Select>
              </div>
            );
          })}
        </div>
      </div>
      <Field label="Internal notes" htmlFor="sub-notes" className="sm:col-span-2">
        <Textarea id="sub-notes" value={value.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Visible only to Beno Super Admins" />
      </Field>
    </div>
  );
}
