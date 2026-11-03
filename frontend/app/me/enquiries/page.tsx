"use client";

import { Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { Chip, Empty, ErrorBox, PageHeader, PageLoader, Panel } from "@/components/ui/misc";

type Enq = { _id: string; name: string; email: string; phone: string; company: string; message: string; status: string; createdAt: string };

export default function MyEnquiriesPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Enq[]>("/me/enquiries"));
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <PageHeader eyebrow="My digital card" title="My enquiries" sub="Messages visitors sent from your card. Your admin can see them too." />
      <Panel>
        {!data?.length ? (
          <Empty icon={<Inbox />} title="No enquiries yet" sub="Share your card — enquiries from the form appear here." />
        ) : (
          <ul>
            {data.map((e) => (
              <li key={e._id} className="border-b border-line px-5 py-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{e.name}</b>
                  {e.status === "new" ? <Chip tone="accent">New</Chip> : e.status === "contacted" ? <Chip tone="warn">Contacted</Chip> : <Chip tone="ok">Closed</Chip>}
                  <span className="text-[12px] text-muted">{fmtDate(e.createdAt, true)}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-muted">{[e.phone, e.email, e.company].filter(Boolean).join(" · ")}</div>
                {e.message && <p className="mt-2 whitespace-pre-line">{e.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
