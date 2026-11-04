"use client";

import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { fmtNum, timeAgo, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip, ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Stat } from "@/components/ui/misc";
import { Legend, TrendChart } from "@/components/charts/trend";

type Dash = {
  employees: { total: number; activeCards: number; inactiveCards: number; published: number; unpublished: number; activated: number; noPhoto: number };
  totals: { views: number; unique: number; shares: number; qrScans: number; saves: number; enquiries: number; calls: number; whatsapp: number };
  last30: { series: { day: string; views: number; saves: number; shares: number }[] };
  newEnquiries: number;
  recentEnquiries: { _id: string; name: string; employeeName: string; message: string; createdAt: string; status: string }[];
  recentActivity: { _id: string; actorName: string; action: string; summary: string; createdAt: string }[];
  subscription: { status: string; planName: string; endDate: string; employeeLimit: number | null };
};

const SERIES = [
  { key: "views", label: "Views", color: "var(--accent)", area: true },
  { key: "saves", label: "Contact saves", color: "var(--ok)" },
  { key: "shares", label: "Shares", color: "var(--warn)" },
];

const nice = (a: string) => a.replace(/^[a-z]+\./, "").replace(/_/g, " ");

export default function AdminDashboard() {
  const { session, hasFeature } = useAuth();
  const { data: d, error, loading, reload } = useLoad(() => api.get<Dash>("/org/dashboard"));
  if (loading && !d) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return null;
  const e = d.employees;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={session?.organization?.name}
        title={`${greet}, ${session?.user.name.split(" ")[0]}`}
        actions={
          <>
            {hasFeature("bulkUpload") && (
              <Button asChild>
                <Link href="/admin/import">
                  <FileSpreadsheet /> Bulk upload
                </Link>
              </Button>
            )}
            <Button asChild variant="primary">
              <Link href="/admin/employees/new">
                <Plus /> Add employee
              </Link>
            </Button>
          </>
        }
      />
      {e.total === 0 && (
        <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3 border-accent/30 bg-accent-soft/40 p-5">
          <div>
            <h2 className="text-lg font-bold">Welcome! Let&apos;s create your first cards</h2>
            <p className="text-muted">1. Set your logo and colours in Branding. 2. Upload employees from Excel or add them one by one. Cards and QR codes are created automatically.</p>
          </div>
          <Button asChild variant="primary">
            <Link href="/admin/branding">Set up branding</Link>
          </Button>
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total employees" value={fmtNum(e.total)} hint={d.subscription.employeeLimit ? `of ${fmtNum(d.subscription.employeeLimit)} in your plan` : "Unlimited plan"} />
        <Stat label="Active cards" value={fmtNum(e.activeCards)} hint={`${fmtNum(e.inactiveCards)} inactive`} />
        <Stat label="Published cards" value={fmtNum(e.published)} hint={`${fmtNum(e.unpublished)} unpublished`} />
        <Stat label="Total card views" value={fmtNum(d.totals.views)} hint={`${fmtNum(d.totals.unique)} unique visitors (daily)`} />
        <Stat label="Shares" value={fmtNum(d.totals.shares)} />
        <Stat label="QR visits" value={fmtNum(d.totals.qrScans)} hint="Opened from the QR code" />
        <Stat label="Contact saves" value={fmtNum(d.totals.saves)} hint={`${fmtNum(d.totals.whatsapp)} WhatsApp taps`} />
        <Stat label="Enquiries" value={fmtNum(d.totals.enquiries)} hint={d.newEnquiries ? `${d.newEnquiries} new` : "None waiting"} tone={d.newEnquiries ? "warn" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel className="min-w-0">
          <PanelHeader title="Engagement · last 30 days" actions={<Legend series={SERIES} />} />
          <div className="px-3 pb-3">
            <TrendChart data={d.last30.series} series={SERIES} />
          </div>
        </Panel>
        <Panel className="min-w-0">
          <PanelHeader title="Card adoption" />
          <div className="flex flex-col gap-4 px-5 pb-5">
            {[
              { label: "Cards published", v: e.published, of: e.total },
              ...(hasFeature("employeeLogin") ? [{ label: "Employees who activated", v: e.activated, of: e.total }] : []),
              { label: "Profiles with a photo", v: e.total - e.noPhoto, of: e.total },
            ].map((r) => {
              const pct = r.of ? Math.round((r.v / r.of) * 100) : 0;
              return (
                <div key={r.label}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span>{r.label}</span>
                    <b className="tabular">
                      {fmtNum(r.v)} / {fmtNum(r.of)} · {pct}%
                    </b>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <Button asChild size="sm" className="self-start">
              <Link href="/admin/reminders">Send adoption reminders</Link>
            </Button>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader title="Latest enquiries" actions={<Link href="/admin/enquiries" className="text-[13px] font-semibold text-accent hover:underline">View all</Link>} />
          <div className="px-5 pb-4">
            {d.recentEnquiries.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No enquiries yet. They appear when visitors use the form on a card.</p>}
            {d.recentEnquiries.map((q) => (
              <div key={q._id} className="border-t border-line py-3 first:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <b>{q.name}</b>
                  <span className="text-[12px] text-muted">{timeAgo(q.createdAt)}</span>
                </div>
                <div className="text-[12px] text-muted">For {q.employeeName}</div>
                {q.message && <p className="mt-1 line-clamp-2 text-[13px]">{q.message}</p>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="min-w-0">
          <PanelHeader title="Recent activity" actions={<Link href="/admin/audit" className="text-[13px] font-semibold text-accent hover:underline">Audit log</Link>} />
          <div className="px-5 pb-4">
            {d.recentActivity.length === 0 && <p className="py-6 text-center text-[13px] text-muted">No activity yet.</p>}
            {d.recentActivity.map((a) => (
              <div key={a._id} className="flex items-start justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <span className="font-semibold">{a.actorName || "System"}</span> <span className="text-muted">{nice(a.action)}</span>
                  {a.summary && <div className="truncate text-[12px] text-muted">{a.summary}</div>}
                </div>
                <span className="shrink-0 text-[12px] text-muted">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <p className="mt-4 text-[12px] text-muted">
        Plan: {d.subscription.planName || "—"} · <Chip tone={d.subscription.status === "active" ? "ok" : "warn"}>{d.subscription.status}</Chip> · ends {fmtDate(d.subscription.endDate)}. Button counts are taps on the card; they do not confirm a call or chat took place.
      </p>
    </>
  );
}
