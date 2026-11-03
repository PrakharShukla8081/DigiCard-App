"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { cn, fmtDate, fmtNum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Chip, Empty, PageHeader, Panel, PanelHeader, Table, Td, Th } from "@/components/ui/misc";

type Job = {
  _id: string;
  fileName: string;
  mode: string;
  status: "queued" | "processing" | "completed" | "failed";
  total: number;
  processed: number;
  created: number;
  updated: number;
  duplicates: number;
  failed: number;
  errorMessage: string;
  rowErrors?: { row: number; employeeCode: string; field: string; message: string }[];
  errorCount?: number;
  createdAt: string;
  finishedAt?: string;
};

const statusChip = (s: Job["status"]) => (s === "completed" ? <Chip tone="ok">Completed</Chip> : s === "failed" ? <Chip tone="bad">Failed</Chip> : <Chip tone="accent">Running</Chip>);

export default function ImportPage() {
  const { hasFeature } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useLoad(() => api.get<Job[]>("/org/import/jobs"));

  // Poll the running job
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const t = setTimeout(async () => {
      try {
        setJob(await api.get<Job>(`/org/import/jobs/${job._id}`));
      } catch {
        /* keep polling */
      }
    }, 900);
    return () => clearTimeout(t);
  }, [job]);

  useEffect(() => {
    if (job?.status === "completed" || job?.status === "failed") history.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  if (!hasFeature("bulkUpload"))
    return (
      <>
        <PageHeader title="Bulk upload" />
        <Panel>
          <Empty icon={<FileSpreadsheet />} title="Bulk upload is not in your plan" sub="Add employees one by one, or contact Beno to upgrade your plan." action={<Button asChild variant="primary"><Link href="/admin/employees/new">Add employee</Link></Button>} />
        </Panel>
      </>
    );

  function pick(f?: File | null) {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) return toast.error("Choose a .csv or .xlsx file.");
    if (f.size > 10 * 1024 * 1024) return toast.error("The file is larger than 10 MB. Split it into smaller files.");
    setFile(f);
  }

  async function start() {
    if (!file) return;
    setBusy(true);
    try {
      const j = await api.upload<Job>("/org/import", file, { mode });
      setJob(j);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const running = job && (job.status === "queued" || job.status === "processing");
  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Company Admin" title="Bulk upload" sub="Add or update thousands of employees from one Excel or CSV file. Every row is checked and problems are listed by row number." />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <PanelHeader title="Upload a file" />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => (e.preventDefault(), setDrag(true))}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition-colors hover:border-accent", drag && "border-accent bg-accent-soft/40")}
            >
              <Upload className="size-7 text-accent" />
              {file ? (
                <>
                  <b>{file.name}</b>
                  <span className="text-[13px] text-muted">{(file.size / 1024).toFixed(0)} KB · click to choose another file</span>
                </>
              ) : (
                <>
                  <b>Drop your Excel or CSV file here</b>
                  <span className="text-[13px] text-muted">or click to browse · .xlsx or .csv · up to 20,000 rows / 10 MB</span>
                </>
              )}
              <input ref={inputRef} type="file" accept=".csv,.xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="eyebrow mb-2">When an Employee ID already exists</legend>
              {(
                [
                  ["create", "Skip it", "Only new employees are added; existing ones are reported as duplicates."],
                  ["upsert", "Update existing", "Existing employees are updated with non-empty cells from the file."],
                ] as const
              ).map(([v, t, d]) => (
                <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border border-line p-3", mode === v && "border-accent bg-accent-soft/40")}>
                  <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <b className="block text-sm">{t}</b>
                    <span className="text-[12px] text-muted">{d}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <Button variant="primary" size="lg" disabled={!file || Boolean(running)} loading={busy} onClick={start}>
                <Upload /> Start import
              </Button>
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="1. Get the template" />
          <div className="flex flex-col gap-3 px-5 pb-5 text-[13px]">
            <p className="text-muted">
              Required columns: <b className="text-fg">Employee ID</b> and <b className="text-fg">First Name</b>. Optional: Last Name, Designation, Department, Work Email, Mobile Number, WhatsApp Number, Profile Photo URL, LinkedIn URL, Short Bio, Location, Card Status.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => api.download("/org/import/template", "employee-import-template.xlsx").catch((e) => toast.error(errMsg(e)))}>
                <Download /> Excel template
              </Button>
              <Button size="sm" onClick={() => api.download("/org/import/template?format=csv", "employee-import-template.csv").catch((e) => toast.error(errMsg(e)))}>
                <Download /> CSV template
              </Button>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Emails and mobile numbers are validated.</li>
              <li>Duplicate Employee IDs or emails inside the file are flagged.</li>
              <li>Rows beyond your plan&apos;s employee limit are not imported.</li>
              <li>Cards are published automatically after import.</li>
            </ul>
          </div>
        </Panel>
      </div>

      {job && (
        <Panel className="mt-4">
          <PanelHeader title={job.fileName} sub={`Started ${fmtDate(job.createdAt, true)}`} actions={statusChip(job.status)} />
          <div className="px-5 pb-5">
            {running && (
              <div className="mb-4">
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span>Processing rows…</span>
                  <b className="tabular">
                    {fmtNum(job.processed)} / {fmtNum(job.total)}
                  </b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            {job.status === "failed" && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 font-semibold text-bad">{job.errorMessage}</p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Rows in file", job.total, ""],
                ["Added", job.created, "text-ok"],
                ["Updated", job.updated, "text-accent"],
                ["Duplicates skipped", job.duplicates, "text-warn"],
                ["Failed", job.failed, "text-bad"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-xl bg-surface-2 p-3">
                  <div className="eyebrow">{l}</div>
                  <div className={cn("tabular font-display text-2xl font-bold", c as string)}>{fmtNum(v as number)}</div>
                </div>
              ))}
            </div>
            {job.status === "completed" && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {job.failed + job.duplicates === 0 ? (
                  <p className="flex items-center gap-2 font-semibold text-ok">
                    <CheckCircle2 className="size-5" /> Every row was imported.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 font-semibold text-warn">
                    <XCircle className="size-5" /> {fmtNum(job.failed + job.duplicates)} row(s) need attention.
                  </p>
                )}
                {(job.errorCount || 0) > 0 && (
                  <Button size="sm" onClick={() => api.download(`/org/import/jobs/${job._id}/errors.csv`, "import-errors.csv").catch((e) => toast.error(errMsg(e)))}>
                    <Download /> Download error report
                  </Button>
                )}
                <Button asChild size="sm" variant="primary">
                  <Link href="/admin/employees">View employees</Link>
                </Button>
              </div>
            )}
          </div>
          {job.rowErrors && job.rowErrors.length > 0 && (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th className="w-20">Row</Th>
                  <Th>Employee ID</Th>
                  <Th>Field</Th>
                  <Th>Problem</Th>
                </tr>
              </thead>
              <tbody>
                {job.rowErrors.map((e, i) => (
                  <tr key={i}>
                    <Td className="tabular">{e.row}</Td>
                    <Td>{e.employeeCode || "—"}</Td>
                    <Td className="text-muted">{e.field}</Td>
                    <Td>{e.message}</Td>
                  </tr>
                ))}
                {(job.errorCount || 0) > job.rowErrors.length && (
                  <tr>
                    <Td colSpan={4} className="text-center text-muted">
                      Showing first {job.rowErrors.length} of {fmtNum(job.errorCount)} — download the error report for the full list.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Panel>
      )}

      <Panel className="mt-4">
        <PanelHeader title="Recent imports" />
        {!history.data?.length ? (
          <p className="px-5 pb-5 text-[13px] text-muted">No imports yet.</p>
        ) : (
          <Table minWidth={680}>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>When</Th>
                <Th>Status</Th>
                <Th className="text-right">Added</Th>
                <Th className="text-right">Updated</Th>
                <Th className="text-right">Failed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {history.data.map((j) => (
                <tr key={j._id}>
                  <Td className="font-semibold">{j.fileName}</Td>
                  <Td className="text-muted">{fmtDate(j.createdAt, true)}</Td>
                  <Td>{statusChip(j.status)}</Td>
                  <Td className="tabular text-right">{fmtNum(j.created)}</Td>
                  <Td className="tabular text-right">{fmtNum(j.updated)}</Td>
                  <Td className="tabular text-right">{fmtNum(j.failed + j.duplicates)}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={async () => setJob(await api.get<Job>(`/org/import/jobs/${j._id}`))}>
                      Details
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
