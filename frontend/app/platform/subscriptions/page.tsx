"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { Select } from "@/components/ui/field";
import { Empty, ErrorBox, PageHeader, PageLoader, Panel, Segmented, SubStatusChip, Table, Td, Th } from "@/components/ui/misc";

type Row = { _id: string; organization: { _id: string; name: string; status: string } | null; planName: string; effectiveStatus: string; startDate: string; endDate: string; daysLeft: number; payment: { reference: string } };

export default function SubscriptionsPage() {
  const [status, setStatus] = useState("");
  const [window, setWindow] = useState<"all" | "30" | "7">("all");
  const qs = new URLSearchParams({ ...(status && { status }), ...(window !== "all" && { expiringInDays: window }) });
  const { data, error, loading, reload } = useLoad(() => api.get<Row[]>(`/platform/subscriptions?${qs}`), [qs.toString()]);

  return (
    <>
      <PageHeader eyebrow="Beno Super Admin" title="Subscriptions" sub="Current subscription of every company, sorted by end date." />
      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <Segmented
            label="Ending"
            value={window}
            onChange={setWindow}
            options={[
              { value: "all", label: "All" },
              { value: "30", label: "Ending in 30 days" },
              { value: "7", label: "Ending in 7 days" },
            ]}
          />
          <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {["active", "trial", "expired", "suspended", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <PageLoader />
        ) : !data?.length ? (
          <Empty icon={<CreditCard />} title="No subscriptions match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th className="text-right">Days left</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s._id}>
                  <Td>
                    {s.organization ? (
                      <Link href={`/platform/organizations/${s.organization._id}`} className="font-semibold hover:text-accent">
                        {s.organization.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{s.planName}</Td>
                  <Td>
                    <SubStatusChip status={s.effectiveStatus} />
                  </Td>
                  <Td>{fmtDate(s.startDate)}</Td>
                  <Td>{fmtDate(s.endDate)}</Td>
                  <Td className={`tabular text-right font-semibold ${s.daysLeft < 0 ? "text-bad" : s.daysLeft <= 7 ? "text-warn" : ""}`}>{s.daysLeft < 0 ? "Ended" : s.daysLeft}</Td>
                  <Td className="text-muted">{s.payment?.reference || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
