"use client";

import { useState } from "react";
import { Inbox, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { Chip, Empty, ErrorBox, PageHeader, PageLoader, Panel } from "@/components/ui/misc";
import { downloadVisitorVcard } from "@/lib/visitor-vcard";

type Enq = { _id: string; kind: "enquiry" | "exchange"; name: string; email: string; phone: string; company: string; designation: string; note: string; message: string; status: string; createdAt: string };

export default function MyEnquiriesPage() {
  const [kind, setKind] = useState<"" | "enquiry" | "exchange">("");
  const { data, error, loading, reload } = useLoad(() => api.get<Enq[]>(`/me/enquiries${kind ? `?kind=${kind}` : ""}`), [kind]);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <PageHeader eyebrow="My digital card" title="My enquiries" sub="Messages visitors sent from your card. Your admin can see them too." />
      <Panel>
        <div className="flex gap-2 border-b border-line px-4 pt-3" role="tablist" aria-label="Filter by type">
          {([["", "All"], ["enquiry", "Enquiries"], ["exchange", "Contacts"]] as const).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={kind === value} className={`border-b-2 px-3 py-2 text-sm font-semibold ${kind === value ? "border-accent text-fg" : "border-transparent text-muted"}`} onClick={() => setKind(value)}>{label}</button>
          ))}
        </div>
        {!data?.length ? (
          <Empty icon={<Inbox />} title="No contacts yet" sub="Share your card — enquiries and contact exchanges will appear here." />
        ) : (
          <ul>
            {data.map((e) => (
              <li key={e._id} className="border-b border-line px-5 py-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{e.name}</b>
                  {e.kind === "exchange" && <Chip>Contact</Chip>}
                  {e.status === "new" ? <Chip tone="accent">New</Chip> : e.status === "contacted" ? <Chip tone="warn">Contacted</Chip> : <Chip tone="ok">Closed</Chip>}
                  <span className="text-[12px] text-muted">{fmtDate(e.createdAt, true)}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-muted">{[e.phone, e.email, e.company, e.designation].filter(Boolean).join(" · ")}</div>
                {(e.kind === "exchange" ? e.note : e.message) && <p className="mt-2 whitespace-pre-line">{e.kind === "exchange" ? e.note : e.message}</p>}
                {e.kind === "exchange" && <Button className="mt-2" size="sm" variant="outline" onClick={() => downloadVisitorVcard(e)}><UserRoundPlus /> Save contact</Button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
