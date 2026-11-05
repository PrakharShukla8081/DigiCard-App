"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtNum } from "@/lib/utils";
import type { Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Chip, Dialog, Empty, ErrorBox, PageHeader, PageLoader, Panel, ToggleRow, useConfirm } from "@/components/ui/misc";
import { PricingCard, type WebsitePlan } from "@/components/site/pricing-card";

type Form = Omit<Plan, "_id" | "employeeLimit" | "price" | "durationDays" | "sortOrder"> & { employeeLimit: string; price: string; durationDays: string; sortOrder: string };
const CYCLES: Record<string, number> = { monthly: 30, quarterly: 90, half_yearly: 182, yearly: 365, custom: 365 };

export default function PlansPage() {
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(async () => {
    const [plans, meta] = await Promise.all([api.get<Plan[]>("/platform/plans"), api.get<{ features: Record<string, string> }>("/platform/meta")]);
    return { plans, features: meta.features };
  });
  const [editing, setEditing] = useState<{ id?: string; form: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBilling, setPreviewBilling] = useState<"yearly" | "monthly">("yearly");

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const open = (p?: Plan) =>
    setEditing({
      id: p?._id,
      form: {
        name: p?.name || "",
        code: p?.code || "",
        description: p?.description || "",
        price: p ? String(p.price) : "",
        currency: p?.currency || "INR",
        billingCycle: p?.billingCycle || "yearly",
        durationDays: p ? String(p.durationDays) : "365",
        employeeLimit: p?.employeeLimit ? String(p.employeeLimit) : "",
        features: { ...(p?.features || {}) },
        isActive: p?.isActive ?? true,
        sortOrder: p ? String(p.sortOrder) : String(data.plans.length + 1),
        website: {
          showOnWebsite: p?.website?.showOnWebsite ?? true,
          group: p?.website?.group || "For Organizations",
          groupSubtitle: p?.website?.groupSubtitle || "",
          userRangeLabel: p?.website?.userRangeLabel || "",
          description: p?.website?.description || "",
          badge: p?.website?.badge || "",
          featured: p?.website?.featured ?? false,
          priceMode: p?.website?.priceMode || "price",
          showMonthlyEquivalent: p?.website?.showMonthlyEquivalent ?? false,
          monthlyPrice: p?.website?.monthlyPrice,
          ctaType: p?.website?.ctaType || "demo",
          ctaLabel: p?.website?.ctaLabel || "",
          featureGroups: p?.website?.featureGroups || [],
        },
      },
    });

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = {
      name: f.name.trim(),
      ...(f.code ? { code: f.code.trim() } : {}),
      description: f.description,
      price: Number(f.price || 0),
      currency: f.currency,
      billingCycle: f.billingCycle,
      durationDays: Number(f.durationDays),
      employeeLimit: f.employeeLimit ? Number(f.employeeLimit) : null,
      features: f.features,
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder || 0),
      website: f.website,
    };
    setBusy(true);
    try {
      if (editing.id) await api.patch(`/platform/plans/${editing.id}`, body);
      else await api.post("/platform/plans", body);
      toast.success("Plan saved");
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<Form>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  return (
    <>
      <PageHeader
        eyebrow="Beno Super Admin"
        title="Subscription plans"
        sub="Set the name, price, billing cycle, employee limit and features of each plan. Changes apply to every company on that plan."
        actions={
          <Button variant="primary" onClick={() => open()}>
            <Plus /> New plan
          </Button>
        }
      />
      {data.plans.length === 0 ? (
        <Panel>
          <Empty icon={<Layers />} title="No plans yet" sub="Create plans such as Starter, Business and Enterprise. Prices and limits are fully up to you." action={<Button variant="primary" onClick={() => open()}>Create a plan</Button>} />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((p) => (
            <Panel key={p._id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <div className="text-[12px] text-muted">code: {p.code}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">{p.isBuiltIn && <Chip>Built-in</Chip>}{p.website?.showOnWebsite && <Chip tone="ok">Website</Chip>}{p.isActive ? <Chip tone="ok">Active</Chip> : <Chip>Inactive</Chip>}</div>
              </div>
              <div className="mt-3 font-display text-[28px] leading-none font-bold">
                {p.currency} {fmtNum(p.price)}
                <span className="ml-1 text-[13px] font-semibold text-muted">/ {p.billingCycle.replace("_", "-")}</span>
              </div>
              <div className="mt-2 text-[13px] text-muted">
                {p.employeeLimit ? `${fmtNum(p.employeeLimit)} employees` : "Unlimited employees"} · {p.durationDays} days · {p.organizations || 0} companies
              </div>
              {p.description && <p className="mt-2 text-[13px] text-muted">{p.description}</p>}
              <ul className="mt-4 flex flex-col gap-1.5 text-[13px]">
                {Object.entries(data.features).map(([k, label]) => (
                  <li key={k} className={p.features?.[k] ? "flex items-start gap-2" : "flex items-start gap-2 text-muted line-through decoration-muted/40"}>
                    {p.features?.[k] ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : <X className="mt-0.5 size-4 shrink-0" />}
                    {label}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex gap-2 pt-1">
                <Button size="sm" onClick={() => open(p)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (p.isBuiltIn) return toast.error("Built-in plans cannot be deleted. Hide or deactivate the plan instead.");
                    if (!(await confirm({ title: `Delete ${p.name}?`, body: "Plans used by any subscription are deactivated instead of deleted.", confirmLabel: "Delete", danger: true }))) return;
                    try {
                      const r = await api.del(`/platform/plans/${p._id}`);
                      toast.success(r.message || "Done");
                      reload();
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog
        wide
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? "Edit plan" : "New plan"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save plan
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name" htmlFor="p-name">
              <Input id="p-name" value={editing.form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Business" />
            </Field>
            <Field label="Code" htmlFor="p-code" hint="Short id, e.g. business">
              <Input id="p-code" value={editing.form.code} onChange={(e) => set({ code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
            </Field>
            <Field label="Price" htmlFor="p-price">
              <div className="flex gap-2">
                <Select className="w-24" value={editing.form.currency} onChange={(e) => set({ currency: e.target.value as "INR" | "USD" })} aria-label="Currency">
                  {["INR", "USD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
                <Input id="p-price" type="number" min={0} value={editing.form.price} onChange={(e) => set({ price: e.target.value })} />
              </div>
            </Field>
            <Field label="Billing cycle" htmlFor="p-cycle">
              <Select id="p-cycle" value={editing.form.billingCycle} onChange={(e) => set({ billingCycle: e.target.value, durationDays: String(CYCLES[e.target.value] || editing.form.durationDays) })}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="half_yearly">Half-yearly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </Select>
            </Field>
            <Field label="Subscription duration (days)" htmlFor="p-days">
              <Input id="p-days" type="number" min={1} value={editing.form.durationDays} onChange={(e) => set({ durationDays: e.target.value })} />
            </Field>
            <Field label="Employee limit" htmlFor="p-limit" hint="Empty = unlimited">
              <Input id="p-limit" type="number" min={1} value={editing.form.employeeLimit} onChange={(e) => set({ employeeLimit: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
              <Textarea id="p-desc" value={editing.form.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <div className="sm:col-span-2 rounded-xl border border-line p-4">
              <div className="eyebrow mb-3">Website presentation</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ToggleRow title="Show on public pricing" checked={Boolean(editing.form.website?.showOnWebsite)} onChange={(v) => set({ website: { ...editing.form.website, showOnWebsite: v } })} />
                <ToggleRow title="Featured card" checked={Boolean(editing.form.website?.featured)} onChange={(v) => set({ website: { ...editing.form.website, featured: v } })} />
                <Field label="Group" htmlFor="p-group"><Input id="p-group" value={editing.form.website?.group || ""} onChange={(e) => set({ website: { ...editing.form.website, group: e.target.value } })} placeholder="For Organizations" /></Field>
                <Field label="User range" htmlFor="p-range"><Input id="p-range" value={editing.form.website?.userRangeLabel || ""} onChange={(e) => set({ website: { ...editing.form.website, userRangeLabel: e.target.value } })} placeholder="5–100 users" /></Field>
                <Field label="Website description" htmlFor="p-web-desc" className="sm:col-span-2"><Textarea id="p-web-desc" value={editing.form.website?.description || ""} onChange={(e) => set({ website: { ...editing.form.website, description: e.target.value } })} /></Field>
                <Field label="Price display" htmlFor="p-price-mode"><Select id="p-price-mode" value={editing.form.website?.priceMode || "price"} onChange={(e) => set({ website: { ...editing.form.website, priceMode: e.target.value as "price" | "per_user" | "custom" } })}><option value="price">Price</option><option value="per_user">Per user</option><option value="custom">Custom pricing</option></Select></Field>
                <Field label="CTA type" htmlFor="p-cta"><Select id="p-cta" value={editing.form.website?.ctaType || "demo"} onChange={(e) => set({ website: { ...editing.form.website, ctaType: e.target.value as "trial" | "demo" | "contact_sales" } })}><option value="trial">Free trial</option><option value="demo">Book a demo</option><option value="contact_sales">Contact sales</option></Select></Field>
                <Field label="CTA label" htmlFor="p-cta-label"><Input id="p-cta-label" value={editing.form.website?.ctaLabel || ""} onChange={(e) => set({ website: { ...editing.form.website, ctaLabel: e.target.value } })} /></Field>
                <ToggleRow title="Show monthly equivalent" checked={Boolean(editing.form.website?.showMonthlyEquivalent)} onChange={(v) => set({ website: { ...editing.form.website, showMonthlyEquivalent: v } })} />
                <Field label="Monthly price (optional)" htmlFor="p-monthly-price" hint="Display price when billed monthly"><Input id="p-monthly-price" type="number" min={0} value={editing.form.website?.monthlyPrice ?? ""} onChange={(e) => set({ website: { ...editing.form.website, monthlyPrice: e.target.value ? Number(e.target.value) : undefined } })} /></Field>
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="eyebrow mb-2">Features</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(data.features).map(([k, label]) => (
                  <ToggleRow key={k} title={label} checked={Boolean(editing.form.features[k])} onChange={(v) => set({ features: { ...editing.form.features, [k]: v } })} />
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">Digital cards, QR codes and basic analytics are included in every plan.</p>
            </div>
            <div className="sm:col-span-2">
              <div className="eyebrow mb-2">Live website preview</div>
              <div className="mb-3 flex justify-end gap-1"><Button size="sm" variant={previewBilling === "yearly" ? "primary" : "outline"} onClick={() => setPreviewBilling("yearly")}>Yearly</Button><Button size="sm" variant={previewBilling === "monthly" ? "primary" : "outline"} onClick={() => setPreviewBilling("monthly")}>Monthly</Button></div>
              <div className="mx-auto max-w-sm">
                <PricingCard
                  plan={{
                    id: editing.id || "preview",
                    name: editing.form.name || "Plan name",
                    code: editing.form.code || "plan",
                    description: editing.form.description,
                    price: Number(editing.form.price || 0),
                    currency: editing.form.currency,
                    billingCycle: editing.form.billingCycle,
                    employeeLimit: editing.form.employeeLimit ? Number(editing.form.employeeLimit) : null,
                    sortOrder: Number(editing.form.sortOrder || 0),
                    features: Object.entries(editing.form.features).map(([key, included]) => ({ key, label: data.features[key] || key, included: Boolean(included) })),
                    website: editing.form.website,
                  }} billing={previewBilling}
                />
              </div>
            </div>
            <ToggleRow title="Plan is active" sub="Inactive plans cannot be assigned to new subscriptions" checked={editing.form.isActive} onChange={(v) => set({ isActive: v })} />
            <Field label="Display order" htmlFor="p-sort">
              <Input id="p-sort" type="number" value={editing.form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
