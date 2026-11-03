"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { Empty, ErrorBox, PageLoader, Pagination, Panel, Table, Td, Th } from "@/components/ui/misc";

type Log = { _id: string; createdAt: string; actorName: string; actorRole: string; action: string; summary: string; organizationName?: string; ip: string };

const ROLE: Record<string, string> = { super_admin: "Super Admin", company_admin: "Admin", employee: "Employee" };

export function AuditTable({ endpoint, showOrg = false }: { endpoint: string; showOrg?: boolean }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useLoad(() => api.getPaged<Log>(`${endpoint}?page=${page}&limit=50`), [page]);
  return (
    <Panel>
      {error ? (
        <div className="p-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <PageLoader />
      ) : !data?.data.length ? (
        <Empty icon={<FileText />} title="No activity yet" />
      ) : (
        <>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>When</Th>
                {showOrg && <Th>Company</Th>}
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((l) => (
                <tr key={l._id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(l.createdAt, true)}</Td>
                  {showOrg && <Td>{l.organizationName}</Td>}
                  <Td>
                    <div className="font-semibold">{l.actorName || "System"}</div>
                    <div className="text-[12px] text-muted">{ROLE[l.actorRole] || l.actorRole}</div>
                  </Td>
                  <Td>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{l.action}</code>
                  </Td>
                  <Td className="max-w-[420px] break-words text-muted">{l.summary}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination {...data.pagination} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}
