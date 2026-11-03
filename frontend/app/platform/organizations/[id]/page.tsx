"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, Power, RefreshCw, UserPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate, fmtNum, daysLeft } from "@/lib/utils";
import type { Invite, Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Chip, Dialog, ErrorBox, InviteResult, PageHeader, PageLoader, Panel, PanelHeader, Stat, SubStatusChip, Table, Td, Th, useConfirm } from "@/components/ui/misc";
import { SubscriptionFields, emptySub, subBody, type SubForm } from "@/components/platform/subscription-form";

type Sub = {
  _id: string;
  planId: string;
  status: string;
  effectiveStatus: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  employeeLimitOverride: number | null;
  priceOverride: number | null;
  featureOverrides: Record<string, boolean>;
  notes: string;
  payment: { reference: string };
  plan: { name: string; employeeLimit: number | null } | null;
  createdAt: string;
};
type Detail = {
  organization: { _id: string; name: string; slug: string; status: string; contact: Record<string, string>; createdAt: string; branding: { logoUrl: string } };
  subscriptions: Sub[];
  admins: { _id: string; name: string; email: string; status: string; lastLoginAt: string | null; invitedAt: string | null }[];
  usage: { employees: number; activeCards: number; publishedCards: number; last30Days: { views: number; saves: number; shares: number; enquiries: number } };
};

const d10 = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(async () => {
    const [detail, plans, meta] = await Promise.all([api.get<Detail>(`/platform/organizations/${id}`), api.get<Plan[]>("/platform/plans"), api.get<{ features: Record<string, string> }>("/platform/meta")]);
    return { detail, plans, features: meta.features };
  }, [id]);

  const [editInfo, setEditInfo] = useState(false);
  const [info, setInfo] = useState({ name: "", slug: "", email: "", phone: "", website: "", address: "", gstin: "" });
  const [subDialog, setSubDialog] = useState<{ mode: "new" | "edit"; subId?: string } | null>(null);
  const [subForm, setSubForm] = useState<SubForm | null>(null);
  const [adminDialog, setAdminDialog] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: "", email: "" });
  const [invite, setInvite] = useState<{ invite: Invite; email: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const { organization: org, subscriptions, admins, usage } = data.detail;
  const current = subscriptions.find((s) => s.isCurrent);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await reload();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openEditInfo = () => {
    setInfo({ name: org.name, slug: org.slug, email: org.contact?.email || "", phone: org.contact?.phone || "", website: org.contact?.website || "", address: org.contact?.address || "", gstin: org.contact?.gstin || "" });
    setEditInfo(true);
  };
  const openSub = (mode: "new" | "edit") => {
    if (mode === "edit" && current) {
      setSubForm({
        planId: current.planId,
        status: current.status,
        startDate: d10(current.startDate),
        endDate: d10(current.endDate),
        employeeLimitOverride: current.employeeLimitOverride ? String(current.employeeLimitOverride) : "",
        priceOverride: current.priceOverride != null ? String(current.priceOverride) : "",
        notes: current.notes || "",
        paymentReference: current.payment?.reference || "",
        featureOverrides: Object.fromEntries(Object.entries(current.featureOverrides || {}).map(([k, v]) => [k, v ? "on" : "off"])),
      });
      setSubDialog({ mode, subId: current._id });
    } else {
      setSubForm(emptySub(data!.plans));
      setSubDialog({ mode: "new" });
    }
  };

  async function toggleStatus() {
    const next = org.status === "active" ? "inactive" : "active";
    const ok = await confirm({
      title: next === "inactive" ? `Deactivate ${org.name}?` : `Activate ${org.name}?`,
      body: next === "inactive" ? "Admins and employees will be signed out and all public cards will go offline until you activate the company again." : "Admins can log in again and published cards come back online (if the subscription is active).",
      confirmLabel: next === "inactive" ? "Deactivate" : "Activate",
      danger: next === "inactive",
    });
    if (ok) run(() => api.post(`/platform/organizations/${id}/status`, { status: next }), next === "inactive" ? "Company deactivated" : "Company activated");
  }

  const limit = current ? current.employeeLimitOverride ?? current.plan?.employeeLimit : null;

  return (
    <>
      <Link href="/platform/organizations" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Companies
      </Link>
      <PageHeader
        eyebrow={`/c/${org.slug}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {org.name} {org.status === "active" ? <Chip tone="ok">Active</Chip> : <Chip tone="bad">Inactive</Chip>}
          </span>
        }
        sub={`Customer since ${fmtDate(org.createdAt)}`}
        actions={
          <>
            <Button onClick={openEditInfo}>
              <Pencil /> Edit details
            </Button>
            <Button variant={org.status === "active" ? "danger-outline" : "primary"} onClick={toggleStatus} loading={busy}>
              <Power /> {org.status === "active" ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Employees" value={fmtNum(usage.employees)} hint={limit ? `of ${fmtNum(limit)} seats` : "Unlimited seats"} tone={limit && usage.employees >= limit ? "warn" : undefined} />
        <Stat label="Published cards" value={fmtNum(usage.publishedCards)} hint={`${fmtNum(usage.activeCards)} active`} />
        <Stat label="Views · 30 days" value={fmtNum(usage.last30Days.views)} hint={`${fmtNum(usage.last30Days.saves)} contact saves`} />
        <Stat label="Enquiries · 30 days" value={fmtNum(usage.last30Days.enquiries)} hint={`${fmtNum(usage.last30Days.shares)} shares`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Subscription"
            actions={
              <>
                {current && (
                  <Button size="sm" onClick={() => openSub("edit")}>
                    <Pencil /> Edit current
                  </Button>
                )}
                <Button size="sm" variant="primary" onClick={() => openSub("new")}>
                  <Plus /> {current ? "Renew / change plan" : "Assign plan"}
                </Button>
              </>
            }
          />
          <div className="px-5 pb-5">
            {current ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="eyebrow">Plan</div>
                  <div className="mt-1 font-display text-lg font-bold">{current.plan?.name || "—"}</div>
                </div>
                <div>
                  <div className="eyebrow">Status</div>
                  <div className="mt-1.5">
                    <SubStatusChip status={current.effectiveStatus} />
                  </div>
                </div>
                <div>
                  <div className="eyebrow">Ends</div>
                  <div className="mt-1 font-semibold">
                    {fmtDate(current.endDate)}
                    {(daysLeft(current.endDate) ?? 0) >= 0 && <span className="text-muted"> · {daysLeft(current.endDate)} days left</span>}
                  </div>
                </div>
                {current.notes && <p className="text-[13px] text-muted sm:col-span-3">Notes: {current.notes}</p>}
              </div>
            ) : (
              <p className="text-muted">No subscription assigned. Cards stay offline until one is active.</p>
            )}
          </div>
          {subscriptions.length > 0 && (
            <Table minWidth={520}>
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Start</Th>
                  <Th>End</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s._id}>
                    <Td className="font-semibold">
                      {s.plan?.name || "—"} {s.isCurrent && <Chip tone="accent" dot={false}>Current</Chip>}
                    </Td>
                    <Td>
                      <SubStatusChip status={s.effectiveStatus} />
                    </Td>
                    <Td>{fmtDate(s.startDate)}</Td>
                    <Td>{fmtDate(s.endDate)}</Td>
                    <Td className="text-muted">{s.payment?.reference || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              title="Company admins"
              actions={
                <Button size="sm" onClick={() => (setNewAdmin({ name: "", email: "" }), setInvite(null), setAdminDialog(true))}>
                  <UserPlus /> Invite admin
                </Button>
              }
            />
            <div className="px-5 pb-4">
              {admins.map((a) => (
                <div key={a._id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0">
                  <div className="min-w-0">
                    <div className="font-semibold">{a.name}</div>
                    <div className="truncate text-[12px] text-muted">{a.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "active" ? <Chip tone="ok">Active</Chip> : a.status === "invited" ? <Chip tone="warn">Invited</Chip> : <Chip tone="bad">Disabled</Chip>}
                    {a.status === "invited" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            const r = await api.post<{ invite: Invite }>(`/platform/users/${a._id}/resend-invite`);
                            setInvite({ invite: r.data.invite, email: a.email });
                            setAdminDialog(true);
                          } catch (e) {
                            toast.error(errMsg(e));
                          }
                        }}
                      >
                        <RefreshCw /> Resend
                      </Button>
                    )}
                    {a.status !== "invited" && (
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`/platform/users/${a._id}/status`, { status: a.status === "active" ? "disabled" : "active" }), a.status === "active" ? "Admin disabled" : "Admin enabled")}>
                        {a.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Contact details" />
            <dl className="grid gap-2 px-5 pb-5 text-[13px]">
              {[
                ["Email", org.contact?.email],
                ["Phone", org.contact?.phone],
                ["Website", org.contact?.website],
                ["GSTIN", org.contact?.gstin],
                ["Address", org.contact?.address],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[90px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="min-w-0 break-words">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      {/* Edit info */}
      <Dialog
        open={editInfo}
        onOpenChange={setEditInfo}
        title="Edit company details"
        footer={
          <>
            <Button onClick={() => setEditInfo(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                const contact = { email: info.email, phone: info.phone, website: info.website, address: info.address, gstin: info.gstin };
                if (await run(() => api.patch(`/platform/organizations/${id}`, { name: info.name, slug: info.slug, contact }), "Saved")) setEditInfo(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2">
            <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
          </Field>
          <Field label="Card URL name" className="sm:col-span-2" hint={info.slug !== org.slug ? "Warning: changing this changes every card link and breaks printed QR codes." : undefined}>
            <Input value={info.slug} onChange={(e) => setInfo({ ...info, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
          </Field>
          <Field label="Email">
            <Input value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={info.website} onChange={(e) => setInfo({ ...info, website: e.target.value })} />
          </Field>
          <Field label="GSTIN">
            <Input value={info.gstin} onChange={(e) => setInfo({ ...info, gstin: e.target.value })} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} />
          </Field>
        </div>
      </Dialog>

      {/* Subscription */}
      <Dialog
        wide
        open={Boolean(subDialog)}
        onOpenChange={(o) => !o && setSubDialog(null)}
        title={subDialog?.mode === "edit" ? "Edit current subscription" : "Assign a new subscription"}
        sub={subDialog?.mode === "new" ? "The previous subscription is kept in history and stops being current." : "Changes apply immediately."}
        footer={
          <>
            <Button onClick={() => setSubDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!subForm) return;
                const ok =
                  subDialog?.mode === "edit"
                    ? await run(() => api.patch(`/platform/subscriptions/${subDialog.subId}`, { ...subBody(subForm, false), clearFeatureOverrides: true }), "Subscription updated")
                    : await run(() => api.post(`/platform/organizations/${id}/subscriptions`, subBody(subForm)), "Subscription assigned");
                if (ok) setSubDialog(null);
              }}
            >
              Save subscription
            </Button>
          </>
        }
      >
        {subForm && <SubscriptionFields value={subForm} onChange={setSubForm} plans={data.plans} features={data.features} lockPlan={subDialog?.mode === "edit"} />}
      </Dialog>

      {/* Admin invite */}
      <Dialog
        open={adminDialog}
        onOpenChange={setAdminDialog}
        title={invite ? "Invite link" : "Invite a company admin"}
        footer={
          invite ? (
            <Button variant="primary" onClick={() => setAdminDialog(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setAdminDialog(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api.post<{ invite: Invite }>(`/platform/organizations/${id}/admins`, newAdmin);
                    setInvite({ invite: r.data.invite, email: newAdmin.email });
                    reload();
                  } catch (e) {
                    toast.error(errMsg(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send invite
              </Button>
            </>
          )
        }
      >
        {invite ? (
          <InviteResult invite={invite.invite} email={invite.email} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
