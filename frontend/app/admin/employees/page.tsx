"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, FileSpreadsheet, Link2, Pencil, Plus, QrCode, Search, Users } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced, useLoad } from "@/lib/hooks";
import { copyText, fmtNum } from "@/lib/utils";
import type { Employee } from "@/lib/types";
import { qrPng, qrSvg } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { CardStatusChips } from "@/components/admin/card-status";
import { Avatar, Chip, Empty, ErrorBox, PageHeader, Pagination, Panel, Skeleton, Table, Td, Th, useConfirm } from "@/components/ui/misc";

async function downloadQr(e: Employee) {
  try {
    const src = await qrPng(e.url, e.qr, 1024, () => toast.warning("The logo couldn't be loaded; the QR code was downloaded without it."));
    const a = document.createElement("a");
    a.href = src;
    a.download = `${e.slug}-qr.png`;
    a.click();
  } catch (e) {
    toast.error(errMsg(e));
  }
}

async function downloadQrSvg(e: Employee) {
  try {
    const svg = await qrSvg(e.url, e.qr, () => toast.warning("The logo couldn't be loaded; the QR code was downloaded without it."));
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${e.slug}-qr.svg`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    toast.error(errMsg(e));
  }
}

export default function EmployeesPage() {
  const confirm = useConfirm();
  const { hasFeature } = useAuth();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search);

  const filter: Record<string, string> = {
    ...(q && { search: q }),
    ...(department && { department }),
    ...(status === "live" && { cardStatus: "active", published: "true" }),
    ...(status === "unpublished" && { published: "false" }),
    ...(status === "inactive" && { cardStatus: "inactive" }),
    ...(status === "nophoto" && { photo: "false" }),
    ...(status === "notactivated" && { activated: "false" }),
  };
  const qs = new URLSearchParams({ page: String(page), limit: "50", sort, ...filter }).toString();
  const { data, error, loading, reload } = useLoad(() => api.getPaged<Employee>(`/org/employees?${qs}`), [qs]);
  const depts = useLoad(() => api.get<string[]>("/org/employees/departments"));

  const rows = data?.data || [];
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r._id));
  const toggleAll = () => setSel((s) => (allOnPage ? new Set([...s].filter((id) => !rows.some((r) => r._id === id))) : new Set([...s, ...rows.map((r) => r._id)])));
  const toggle = (id: string) =>
    setSel((s) => {
      const next = new Set(s); // never mutate the previous state
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function bulk(action: string) {
    const n = sel.size;
    if (action === "delete" && !(await confirm({ title: `Delete ${n} employee${n === 1 ? "" : "s"}?`, body: "Their cards, links and QR codes stop working immediately and their logins are removed. Analytics totals are kept. This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    if (action === "invite" && !(await confirm({ title: `Send login invites to ${n} employee${n === 1 ? "" : "s"}?`, body: "Employees with a work email get an email to set their password. Employees who already have an active login are skipped.", confirmLabel: "Send invites" }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ affected: number; skipped?: number; reasons?: string[] }>("/org/employees/bulk", { ids: [...sel], action });
      const extra = r.data.skipped ? ` · ${r.data.skipped} skipped` : "";
      toast.success(`${r.data.affected} updated${extra}`, r.data.reasons?.length ? { description: r.data.reasons.slice(0, 3).join("\n") } : undefined);
      setSel(new Set());
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Employees & cards"
        sub="Every employee has a permanent card link and QR code. Editing a profile never changes the link."
        actions={
          <>
            <Button onClick={() => api.download(`/org/employees/export.csv?${new URLSearchParams(filter)}`, "employees.csv").catch((e) => toast.error(errMsg(e)))}>
              <Download /> Export
            </Button>
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
      <Panel>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-[2]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Search name, ID, email, phone, designation" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} aria-label="Search employees" />
          </div>
          <Select className="w-auto flex-1" value={department} onChange={(e) => (setDepartment(e.target.value), setPage(1))} aria-label="Department">
            <option value="">All departments</option>
            {(depts.data || []).map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
          <Select className="w-auto flex-1" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Card status">
            <option value="">All cards</option>
            <option value="live">Live</option>
            <option value="unpublished">Unpublished</option>
            <option value="inactive">Inactive</option>
            <option value="nophoto">No photo</option>
            {hasFeature("employeeLogin") && <option value="notactivated">Not activated</option>}
          </Select>
          <Select className="w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="code">Employee ID</option>
            <option value="views">Most viewed</option>
          </Select>
        </div>

        {sel.size > 0 && (
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5">
            <b className="mr-2 text-[13px] text-accent">{sel.size} selected</b>
            <Button size="sm" onClick={() => bulk("publish")} disabled={busy}>
              Publish
            </Button>
            <Button size="sm" onClick={() => bulk("unpublish")} disabled={busy}>
              Unpublish
            </Button>
            <Button size="sm" onClick={() => bulk("activate")} disabled={busy}>
              Activate
            </Button>
            <Button size="sm" onClick={() => bulk("deactivate")} disabled={busy}>
              Deactivate
            </Button>
            {hasFeature("employeeLogin") && (
              <Button size="sm" onClick={() => bulk("invite")} disabled={busy}>
                Send login invites
              </Button>
            )}
            <Button size="sm" onClick={() => api.download(`/org/employees/qr.zip?ids=${[...sel].join(",")}`, "qr-codes.zip").catch((e) => toast.error(errMsg(e)))}>
              <QrCode /> QR codes (ZIP)
            </Button>
            <Button size="sm" variant="danger-outline" onClick={() => bulk("delete")} disabled={busy}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {error ? (
          <div className="p-4">
            <ErrorBox message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty
            icon={<Users />}
            title={q || department || status ? "No employees match" : "No employees yet"}
            sub={q || department || status ? "Try a different search or filter." : "Add employees one by one or upload them all from an Excel/CSV file."}
            action={
              !(q || department || status) && (
                <div className="flex gap-2">
                  <Button asChild variant="primary">
                    <Link href="/admin/employees/new">Add employee</Link>
                  </Button>
                  {hasFeature("bulkUpload") && (
                    <Button asChild>
                      <Link href="/admin/import">Bulk upload</Link>
                    </Button>
                  )}
                </div>
              )
            }
          />
        ) : (
          <>
            <Table minWidth={880}>
              <thead>
                <tr>
                  <Th className="w-10">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" />
                  </Th>
                  <Th>Employee</Th>
                  <Th>Department</Th>
                  <Th>Card</Th>
                  {hasFeature("employeeLogin") && <Th>Login</Th>}
                  <Th className="text-right">Views</Th>
                  <Th className="text-right">Shares</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e._id} className={sel.has(e._id) ? "bg-accent-soft/40" : "hover:bg-surface-2/50"}>
                    <Td>
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sel.has(e._id)} onChange={() => toggle(e._id)} aria-label={`Select ${e.name}`} />
                    </Td>
                    <Td>
                      <Link href={`/admin/employees/${e._id}`} className="flex items-center gap-3">
                        <Avatar name={e.name} src={e.photoUrl} />
                        <div className="min-w-0">
                          <div className="font-bold hover:text-accent">{e.name}</div>
                          <div className="truncate text-[12px] text-muted">
                            {e.employeeCode}
                            {e.designation ? ` · ${e.designation}` : ""}
                          </div>
                        </div>
                      </Link>
                    </Td>
                    <Td>{e.department || <span className="text-muted">—</span>}</Td>
                    <Td>
                      <CardStatusChips e={e} />
                    </Td>
                    {hasFeature("employeeLogin") && (
                      <Td>{e.login?.status === "active" ? <Chip tone="ok">Active</Chip> : e.login?.status === "invited" ? <Chip tone="warn">Invited</Chip> : e.login?.status === "disabled" ? <Chip tone="bad">Disabled</Chip> : <span className="text-[12px] text-muted">No login</span>}</Td>
                    )}
                    <Td className="tabular text-right">{fmtNum(e.stats?.views)}</Td>
                    <Td className="tabular text-right">{fmtNum(e.stats?.shares)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" asChild aria-label={`Edit ${e.name}`} title="Edit card">
                          <Link href={`/admin/employees/${e._id}`}>
                            <Pencil />
                          </Link>
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Copy card link"
                          aria-label={`Copy link for ${e.name}`}
                          onClick={async () => ((await copyText(e.url)) ? toast.success("Card link copied") : toast.error("Could not copy"))}
                        >
                          <Link2 />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="Download QR PNG" aria-label={`Download QR PNG for ${e.name}`} onClick={() => downloadQr(e)}>
                          <QrCode />
                        </Button>
                        <Button size="icon-sm" variant="ghost" title="Download QR SVG" aria-label={`Download QR SVG for ${e.name}`} onClick={() => downloadQrSvg(e)}>
                          <Download />
                        </Button>
                        <Button size="icon-sm" variant="ghost" asChild title="Open card" aria-label={`Open card of ${e.name}`}>
                          <a href={e.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...data!.pagination} onPage={setPage} />
          </>
        )}
      </Panel>
      {data && data.pagination.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
          <span>{fmtNum(data.pagination.total)} employees match</span>
          <Button size="sm" variant="ghost" onClick={() => api.download(`/org/employees/qr.zip?${new URLSearchParams(filter)}`, "qr-codes.zip").catch((e) => toast.error(errMsg(e)))}>
            <QrCode /> Download QR codes for all {fmtNum(data.pagination.total)} (ZIP)
          </Button>
        </div>
      )}
    </>
  );
}
