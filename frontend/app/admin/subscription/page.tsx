"use client";

import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { daysLeft, fmtDate, fmtNum } from "@/lib/utils";
import { ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, SubStatusChip, Table, Td, Th } from "@/components/ui/misc";

type Sub = {
  status: string;
  active: boolean;
  plan: { name: string; billingCycle: string; description: string } | null;
  startDate: string | null;
  endDate: string | null;
  employeeLimit: number | null;
  employeesUsed: number;
  features: { key: string; label: string; enabled: boolean }[];
  history: { _id: string; planName: string; status: string; startDate: string; endDate: string }[];
};

export default function SubscriptionPage() {
  const { data: s, error, loading, reload } = useLoad(() => api.get<Sub>("/org/subscription"));
  if (loading && !s) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!s) return null;
  const pct = s.employeeLimit ? Math.min(100, Math.round((s.employeesUsed / s.employeeLimit) * 100)) : 0;
  const left = daysLeft(s.endDate);
  return (
    <>
      <PageHeader eyebrow="Company Admin" title="Subscription" sub="Your plan is managed by Beno. Contact Beno to renew, upgrade or add employees." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="eyebrow">Current plan</div>
              <div className="font-display text-[28px] font-bold">{s.plan?.name || "No plan"}</div>
            </div>
            <SubStatusChip status={s.status} />
          </div>
          {s.plan?.description && <p className="mt-1 text-muted">{s.plan.description}</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="eyebrow">Period</div>
              <div className="mt-1 font-semibold">
                {fmtDate(s.startDate)} – {fmtDate(s.endDate)}
              </div>
              {left !== null && <div className={`text-[13px] ${left <= 7 ? "font-semibold text-warn" : "text-muted"}`}>{left >= 0 ? `${left} days left` : "Ended"}</div>}
            </div>
            <div>
              <div className="eyebrow">Employee seats</div>
              <div className="tabular mt-1 font-semibold">
                {fmtNum(s.employeesUsed)} / {s.employeeLimit ? fmtNum(s.employeeLimit) : "Unlimited"}
              </div>
              {s.employeeLimit && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full rounded-full ${pct >= 95 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="What's included" />
          <ul className="flex flex-col gap-2 px-5 pb-5 text-[14px]">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-ok" /> Digital cards, QR codes and basic analytics
            </li>
            {s.features.map((f) => (
              <li key={f.key} className={`flex items-center gap-2 ${f.enabled ? "" : "text-muted"}`}>
                {f.enabled ? <Check className="size-4 text-ok" /> : <X className="size-4" />} {f.label}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {s.history.length > 0 && (
        <Panel className="mt-4">
          <PanelHeader title="History" />
          <Table minWidth={480}>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Start</Th>
                <Th>End</Th>
              </tr>
            </thead>
            <tbody>
              {s.history.map((h) => (
                <tr key={h._id}>
                  <Td className="font-semibold">{h.planName}</Td>
                  <Td>
                    <SubStatusChip status={h.status} />
                  </Td>
                  <Td>{fmtDate(h.startDate)}</Td>
                  <Td>{fmtDate(h.endDate)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </>
  );
}
