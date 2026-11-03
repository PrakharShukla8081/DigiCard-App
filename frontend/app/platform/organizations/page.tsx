"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import { fmtDate, fmtNum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Chip, Empty, ErrorBox, PageHeader, Pagination, Panel, Skeleton, SubStatusChip, Table, Td, Th } from "@/components/ui/misc";

type Org = {
  _id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string;
  employees: number;
  createdAt: string;
  contact: { email?: string };
  subscription: { status: string; planName: string; endDate: string; employeeLimit: number | null } | null;
};

export default function OrganizationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sub, setSub] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const params = new URLSearchParams({ page: String(page), limit: "25", ...(q && { search: q }), ...(status && { status }), ...(sub && { subscription: sub }) });
  const { data, error, loading, reload } = useLoad(() => api.getPaged<Org>(`/platform/organizations?${params}`), [params.toString()]);

  return (
    <>
      <PageHeader
        eyebrow="Beno Super Admin"
        title="Companies"
        sub="Every subscribing company has its own isolated account, admins and employees."
        actions={
          <Button asChild variant="primary">
            <Link href="/platform/organizations/new">
              <Plus /> New company
            </Link>
          </Button>
        }
      />
      <Panel>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search company name" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} aria-label="Search companies" />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Account status">
            <option value="">All accounts</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select className="w-auto" value={sub} onChange={(e) => (setSub(e.target.value), setPage(1))} aria-label="Subscription status">
            <option value="">All subscriptions</option>
            {["active", "trial", "expired", "suspended", "cancelled", "none"].map((s) => (
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
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <Empty icon={<Building2 />} title="No companies found" sub={q || status || sub ? "Try a different search or filter." : "Create the first subscribing company to get started."} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th>Account</Th>
                  <Th>Plan</Th>
                  <Th>Subscription</Th>
                  <Th className="text-right">Employees</Th>
                  <Th>Ends</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((o) => (
                  <tr key={o._id} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/platform/organizations/${o._id}`} className="flex items-center gap-3">
                        {o.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.logoUrl} alt="" className="size-9 rounded-lg border border-line object-contain" />
                        ) : (
                          <div className="grid size-9 place-items-center rounded-lg bg-surface-2 font-bold text-muted">{o.name[0]}</div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold hover:text-accent">{o.name}</div>
                          <div className="text-[12px] text-muted">/{o.slug}</div>
                        </div>
                      </Link>
                    </Td>
                    <Td>{o.status === "active" ? <Chip tone="ok">Active</Chip> : <Chip tone="bad">Inactive</Chip>}</Td>
                    <Td>{o.subscription?.planName || "—"}</Td>
                    <Td>
                      <SubStatusChip status={o.subscription?.status} />
                    </Td>
                    <Td className="tabular text-right">
                      {fmtNum(o.employees)}
                      {o.subscription?.employeeLimit ? <span className="text-muted"> / {fmtNum(o.subscription.employeeLimit)}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(o.subscription?.endDate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...data.pagination} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
