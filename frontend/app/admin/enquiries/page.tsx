"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Inbox, Search, Trash2, UserRoundPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useDebounced, useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Chip, Empty, ErrorBox, PageHeader, PageLoader, Pagination, Panel, useConfirm } from "@/components/ui/misc";
import { downloadVisitorVcard } from "@/lib/visitor-vcard";

type Enq = { _id: string; kind: "enquiry" | "exchange"; name: string; email: string; phone: string; company: string; designation: string; note: string; message: string; status: "new" | "contacted" | "closed"; source: string; employeeName: string; createdAt: string; consent: boolean; consentAt: string | null };

export default function EnquiriesPage() {
  const confirm = useConfirm();
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<"" | "enquiry" | "exchange">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const qs = new URLSearchParams({ page: String(page), limit: "25", ...(kind && { kind }), ...(status && { status }), ...(q && { search: q }) }).toString();
  const { data, error, loading, reload, setData } = useLoad(() => api.getPaged<Enq>(`/org/enquiries?${qs}`), [qs]);

  async function setSt(id: string, st: Enq["status"]) {
    try {
      await api.patch(`/org/enquiries/${id}`, { status: st });
      setData((d) => (d ? { ...d, data: d.data.map((e) => (e._id === id ? { ...e, status: st } : e)) } : d));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Enquiries"
        sub="Messages sent through the enquiry form on employee cards."
        actions={
          <Button onClick={() => api.download("/org/enquiries/export.csv", "enquiries.csv").catch((e) => toast.error(errMsg(e)))}>
            <Download /> Export CSV
          </Button>
        }
      />
      <Panel>
        <div className="flex gap-2 border-b border-line px-4 pt-3" role="tablist" aria-label="Filter by type">
          {([["", "All"], ["enquiry", "Enquiries"], ["exchange", "Contacts"]] as const).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={kind === value} className={`border-b-2 px-3 py-2 text-sm font-semibold ${kind === value ? "border-accent text-fg" : "border-transparent text-muted"}`} onClick={() => (setKind(value), setPage(1))}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name, email, phone, company" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} aria-label="Search enquiries" />
          </div>
          <Select className="w-auto" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <PageLoader />
        ) : !data?.data.length ? (
          <Empty icon={<Inbox />} title="No enquiries" sub="When a visitor sends the form on a card, it appears here and is emailed to the employee and admins." />
        ) : (
          <>
            <ul>
              {data.data.map((e) => (
                <li key={e._id} className="flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{e.name}</b>
                      {e.kind === "exchange" && <Chip>Contact</Chip>}
                      {e.status === "new" ? <Chip tone="accent">New</Chip> : e.status === "contacted" ? <Chip tone="warn">Contacted</Chip> : <Chip tone="ok">Closed</Chip>}
                      {e.source === "qr" && <Chip dot={false}>via QR</Chip>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {[e.phone, e.email, e.company, e.designation].filter(Boolean).join(" · ")} — for <b className="text-fg">{e.employeeName}</b> · {fmtDate(e.createdAt, true)}
                    </div>
                    <div className="mt-1 text-[12px] text-muted">Consent: {e.consent && e.consentAt ? `Yes, ${fmtDate(e.consentAt, true)}` : "—"}</div>
                    {(e.kind === "exchange" ? e.note : e.message) && <p className="mt-2 max-w-3xl text-[14px] whitespace-pre-line">{e.kind === "exchange" ? e.note : e.message}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {e.kind === "exchange" && <Button size="sm" variant="outline" onClick={() => downloadVisitorVcard(e)}><UserRoundPlus /> Save contact</Button>}
                    <Select className="h-8 w-auto text-[13px]" value={e.status} onChange={(ev) => setSt(e._id, ev.target.value as Enq["status"])} aria-label="Change status">
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="closed">Closed</option>
                    </Select>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete enquiry"
                      onClick={async () => {
                        if (!(await confirm({ title: "Delete this enquiry?", confirmLabel: "Delete", danger: true }))) return;
                        await api.del(`/org/enquiries/${e._id}`).catch((er) => toast.error(errMsg(er)));
                        reload();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination {...data.pagination} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
