"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Lock } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { fmtNum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Avatar, ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Segmented, Table, Td, Th } from "@/components/ui/misc";
import { Legend, TrendChart } from "@/components/charts/trend";

type Totals = Record<string, number>;
type A = {
  range: { from: string; to: string };
  days: number;
  advanced: boolean;
  totals: Totals;
  previousTotals: Totals;
  series: { day: string; views: number; unique: number; shares: number; saves: number; enquiries: number; qr: number }[];
  employees: { employeeId: string; name: string; designation: string; department: string; photoUrl: string; views: number; unique: number; shares: number; saves: number; calls: number; whatsapp: number; emails: number; enquiries: number; qr: number }[];
};

const SERIES = [
  { key: "views", label: "Views", color: "var(--accent)", area: true },
  { key: "unique", label: "Unique visitors", color: "#0EA5E9" },
  { key: "saves", label: "Contact saves", color: "var(--ok)" },
  { key: "shares", label: "Shares", color: "var(--warn)" },
];

const METRICS: { key: string; label: string; hint?: string }[] = [
  { key: "view", label: "Card views" },
  { key: "unique", label: "Unique visitors", hint: "Counted once per visitor per day" },
  { key: "share", label: "Shares", hint: "Share button taps" },
  { key: "vcard_download", label: "Contact saves" },
  { key: "qr_scan", label: "QR visits", hint: "Card opened from a QR code" },
  { key: "call_click", label: "Call taps" },
  { key: "whatsapp_click", label: "WhatsApp taps" },
  { key: "email_click", label: "Email taps" },
  { key: "website_click", label: "Website taps" },
  { key: "social_click", label: "Social link taps" },
  { key: "enquiry", label: "Enquiries", hint: "Form submissions" },
];

function delta(cur: number, prev: number) {
  if (!prev) return cur ? <span className="font-bold text-ok">new</span> : <span className="text-muted">—</span>;
  const p = Math.round(((cur - prev) / prev) * 100);
  return <span className={p >= 0 ? "font-bold text-ok" : "font-bold text-bad"}>{p >= 0 ? "↑" : "↓"} {Math.abs(p)}%</span>;
}

export default function AnalyticsPage() {
  const { hasFeature } = useAuth();
  const advanced = hasFeature("advancedAnalytics");
  const [range, setRange] = useState<"today" | "7d" | "30d" | "90d" | "custom">("30d");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const qs = range === "custom" ? `from=${from}&to=${to}` : `range=${range}`;
  const { data, error, loading, reload } = useLoad(() => api.get<A>(`/org/analytics?${qs}`), [qs]);

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Analytics"
        sub="Only events the app can genuinely measure. A WhatsApp or call tap means the button was tapped — not that a call or chat happened."
        actions={
          advanced && (
            <Button onClick={() => api.download(`/org/analytics/export.csv?${qs}`, "analytics.csv").catch((e) => toast.error(errMsg(e)))}>
              <Download /> Export CSV
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Date range"
          value={range}
          onChange={(v) => {
            if ((v === "custom" || v === "90d") && !advanced) return toast.info("Longer and custom ranges need Advanced analytics in your plan.");
            setRange(v);
          }}
          options={[
            { value: "today", label: "Today" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "90d", label: "90 days" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-muted">to</span>
            <Input type="date" className="w-auto" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        )}
        {!advanced && (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <Lock className="size-3.5" /> Custom ranges, per-employee table and export need Advanced analytics
          </span>
        )}
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading && !data ? (
        <PageLoader />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {METRICS.map((m) => (
              <Panel key={m.key} className="p-4" title={m.hint}>
                <div className="eyebrow">{m.label}</div>
                <div className="tabular mt-1 font-display text-[24px] leading-tight font-bold">{fmtNum(data.totals[m.key])}</div>
                <div className="mt-0.5 text-[12px] text-muted">{delta(data.totals[m.key] || 0, data.previousTotals[m.key] || 0)} vs previous</div>
              </Panel>
            ))}
          </div>
          <Panel className="mt-4">
            <PanelHeader title="Daily trend" sub={`${data.range.from} to ${data.range.to}`} actions={<Legend series={SERIES} />} />
            <div className="px-3 pb-3">
              <TrendChart data={data.series} series={SERIES} height={280} />
            </div>
          </Panel>
          {advanced ? (
            <Panel className="mt-4">
              <PanelHeader title="Employee leaderboard" sub="Ranked by engagement: shares ×3, contact saves ×2, enquiries ×5, views ×1" />
              {data.employees.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-muted">No card activity in this period.</p>
              ) : (
                <Table minWidth={900}>
                  <thead>
                    <tr>
                      <Th className="w-10">#</Th>
                      <Th>Employee</Th>
                      <Th className="text-right">Views</Th>
                      <Th className="text-right">Unique</Th>
                      <Th className="text-right">Shares</Th>
                      <Th className="text-right">Saves</Th>
                      <Th className="text-right">Calls</Th>
                      <Th className="text-right">WhatsApp</Th>
                      <Th className="text-right">QR</Th>
                      <Th className="text-right">Enquiries</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((e, i) => (
                      <tr key={e.employeeId}>
                        <Td className="tabular text-muted">{i + 1}</Td>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={e.name} src={e.photoUrl} size={32} />
                            <div className="min-w-0">
                              <div className="font-semibold">{e.name}</div>
                              <div className="truncate text-[12px] text-muted">{[e.designation, e.department].filter(Boolean).join(" · ")}</div>
                            </div>
                          </div>
                        </Td>
                        {[e.views, e.unique, e.shares, e.saves, e.calls, e.whatsapp, e.qr, e.enquiries].map((v, k) => (
                          <Td key={k} className="tabular text-right">
                            {fmtNum(v)}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>
          ) : null}
        </>
      ) : null}
    </>
  );
}
