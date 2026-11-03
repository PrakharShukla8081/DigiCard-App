"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate, fmtNum, daysLeft } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Stat, SubStatusChip } from "@/components/ui/misc";
import { Legend, TrendChart } from "@/components/charts/trend";

type Dash = {
  organizations: { total: number; active: number; inactive: number };
  employees: { total: number };
  cards: { active: number; inactive: number; published: number; unpublished: number };
  subscriptions: Record<string, number>;
  expiringSoon: { organizationId: string; organizationName: string; endDate: string; status: string }[];
  engagement: { totals: { views: number; saves: number; shares: number; enquiries: number }; series: { day: string; views: number; saves: number; shares: number }[] };
  topOrganizations: { organizationId: string; name: string; employees: number }[];
  recentOrganizations: { _id: string; name: string; slug: string; status: string; createdAt: string }[];
};

const SERIES = [
  { key: "views", label: "Card views", color: "var(--accent)", area: true },
  { key: "saves", label: "Contact saves", color: "var(--ok)" },
  { key: "shares", label: "Shares", color: "var(--warn)" },
];

export default function PlatformDashboard() {
  const { data: d, error, loading, reload } = useLoad(() => api.get<Dash>("/platform/dashboard"));
  if (loading && !d) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return null;
  const subs = d.subscriptions;
  return (
    <>
      <PageHeader
        eyebrow="Beno Super Admin"
        title="Platform overview"
        actions={
          <Button asChild variant="primary">
            <Link href="/platform/organizations/new">
              <Plus /> New company
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Companies" value={fmtNum(d.organizations.total)} hint={`${d.organizations.active} active · ${d.organizations.inactive} inactive`} />
        <Stat label="Employees" value={fmtNum(d.employees.total)} hint="Across all companies" />
        <Stat label="Active cards" value={fmtNum(d.cards.active)} hint={`${fmtNum(d.cards.inactive)} inactive`} />
        <Stat label="Published cards" value={fmtNum(d.cards.published)} hint={`${fmtNum(d.cards.unpublished)} unpublished`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["active", "trial", "expired", "suspended", "cancelled"] as const).map((s) => (
          <Panel key={s} className="flex items-center justify-between gap-2 px-4 py-3">
            <SubStatusChip status={s} />
            <span className="tabular font-display text-xl font-bold">{subs[s] || 0}</span>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Card engagement · last 30 days" actions={<Legend series={SERIES} />} />
          <div className="px-3 pb-3">
            <TrendChart data={d.engagement.series} series={SERIES} />
          </div>
          <div className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
            {[
              ["Views", d.engagement.totals.views],
              ["Contact saves", d.engagement.totals.saves],
              ["Shares", d.engagement.totals.shares],
              ["Enquiries", d.engagement.totals.enquiries],
            ].map(([l, v]) => (
              <div key={l as string} className="px-5 py-3">
                <div className="eyebrow">{l}</div>
                <div className="tabular font-display text-lg font-bold">{fmtNum(v as number)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Expiring in 30 days" sub="Renew these before cards go offline" />
          <div className="px-5 pb-4">
            {d.expiringSoon.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No subscriptions end in the next 30 days.</p>
            ) : (
              d.expiringSoon.map((s) => (
                <Link key={s.organizationId} href={`/platform/organizations/${s.organizationId}`} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0 hover:text-accent">
                  <span className="min-w-0 truncate font-semibold">{s.organizationName}</span>
                  <span className="text-right text-[12px] whitespace-nowrap text-muted">
                    {fmtDate(s.endDate)} · <b className="text-warn">{daysLeft(s.endDate)} d</b>
                  </span>
                </Link>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Largest companies" sub="By employee count" />
          <div className="px-5 pb-4">
            {d.topOrganizations.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No employees yet.</p>}
            {d.topOrganizations.map((o) => (
              <Link key={o.organizationId} href={`/platform/organizations/${o.organizationId}`} className="flex items-center justify-between border-t border-line py-2.5 first:border-t-0 hover:text-accent">
                <span className="font-semibold">{o.name}</span>
                <span className="tabular font-bold">{fmtNum(o.employees)}</span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recently added" actions={<Link href="/platform/organizations" className="text-[13px] font-semibold text-accent hover:underline">View all</Link>} />
          <div className="px-5 pb-4">
            {d.recentOrganizations.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No companies yet. Create the first one.</p>}
            {d.recentOrganizations.map((o) => (
              <Link key={o._id} href={`/platform/organizations/${o._id}`} className="flex items-center justify-between border-t border-line py-2.5 first:border-t-0 hover:text-accent">
                <span className="font-semibold">{o.name}</span>
                <span className="text-[12px] text-muted">{fmtDate(o.createdAt)}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
