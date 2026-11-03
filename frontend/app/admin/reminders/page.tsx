"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Send } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { DAYS, fmtDate, fmtNum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Chip, Empty, ErrorBox, PageHeader, PageLoader, Panel, PanelHeader, Table, Td, Th, ToggleRow, useConfirm } from "@/components/ui/misc";

type Settings = {
  enabled: boolean;
  channels: { email: boolean; whatsapp: boolean };
  criteria: { notActivated: boolean; noPhoto: boolean; inactiveDays: number };
  schedule: { dayOfWeek: number; hour: number };
  minDaysBetween: number;
  lastRunAt: string | null;
};
type Data = {
  settings: Settings;
  whatsapp: { useOwn: boolean; phoneNumberId: string; templateName: string; templateLang: string; hasToken: boolean; configured: boolean; source: string | null };
  emailConfigured: boolean;
  features: { email: boolean; whatsapp: boolean };
  preview: { notActivated: number; noPhoto: number; inactive: number; eligibleNow: number; loginEnabled: boolean };
  logs: { _id: string; createdAt: string; channel: string; status: string; reason: string; to: string; employeeName: string }[];
};

export default function RemindersPage() {
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad(() => api.get<Data>("/org/reminders"));
  const [s, setS] = useState<Settings | null>(null);
  const [wa, setWa] = useState({ useOwn: false, phoneNumberId: "", templateName: "", templateLang: "en", accessToken: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setS(data.settings);
    setWa({ useOwn: data.whatsapp.useOwn, phoneNumberId: data.whatsapp.phoneNumberId || "", templateName: data.whatsapp.templateName || "", templateLang: data.whatsapp.templateLang || "en", accessToken: "" });
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !s) return null;

  if (!data.features.email && !data.features.whatsapp)
    return (
      <>
        <PageHeader title="Adoption reminders" />
        <Panel>
          <Empty icon={<Bell />} title="Reminders are not in your plan" sub="Contact Beno to add automated email or WhatsApp reminders." />
        </Panel>
      </>
    );

  async function save() {
    setBusy(true);
    try {
      await api.put("/org/reminders", { enabled: s!.enabled, channels: s!.channels, criteria: s!.criteria, schedule: s!.schedule, minDaysBetween: s!.minDaysBetween });
      toast.success("Reminder settings saved");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    if (!(await confirm({ title: "Send reminders now?", body: `About ${fmtNum(data!.preview.eligibleNow)} employee(s) match your rules and have not had a reminder in the last ${s!.minDaysBetween} days. Save your settings first if you changed them.`, confirmLabel: "Send now" }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ matched?: number; skipped?: string; email: Record<string, number>; whatsapp: Record<string, number> }>("/org/reminders/run");
      if (r.data.skipped) toast.info(`Nothing sent: ${r.data.skipped}`);
      else toast.success(`${r.data.matched} matched · email ${r.data.email.sent} sent · WhatsApp ${r.data.whatsapp.sent} sent`);
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
        title="Adoption reminders"
        sub="Automatically nudge employees who have not activated or shared their card."
        actions={
          <>
            <Button onClick={runNow} loading={busy}>
              <Send /> Send now
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Save settings
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Not activated", data.preview.loginEnabled ? data.preview.notActivated : "—", data.preview.loginEnabled ? "Never logged in" : "Employee login is off"],
          ["No photo", data.preview.noPhoto, "Profile without a photo"],
          [`No activity in ${s.criteria.inactiveDays || 30} days`, data.preview.inactive, "No views, shares or saves"],
          ["Would get a reminder now", data.preview.eligibleNow, "Matches rules & not reminded recently"],
        ].map(([l, v, h]) => (
          <Panel key={l as string} className="p-4">
            <div className="eyebrow">{l}</div>
            <div className="tabular mt-1 font-display text-[26px] font-bold">{typeof v === "number" ? fmtNum(v) : v}</div>
            <div className="text-[12px] text-muted">{h}</div>
          </Panel>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Rules & schedule" sub={s.lastRunAt ? `Last run ${fmtDate(s.lastRunAt, true)}` : "Not run yet"} />
          <div className="flex flex-col gap-3 px-5 pb-5">
            <ToggleRow title="Scheduled reminders" sub="Send automatically every week" checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} />
            <div className="eyebrow mt-2">Remind employees who…</div>
            <ToggleRow title="Have not activated their card" sub="Includes a fresh login link" checked={s.criteria.notActivated} onChange={(v) => setS({ ...s, criteria: { ...s.criteria, notActivated: v } })} locked={data.preview.loginEnabled ? undefined : "Needs employee login (Branding & card design)"} />
            <ToggleRow title="Have no profile photo" checked={s.criteria.noPhoto} onChange={(v) => setS({ ...s, criteria: { ...s.criteria, noPhoto: v } })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="No card activity for (days)" hint="0 turns this rule off">
                <Input type="number" min={0} max={365} value={s.criteria.inactiveDays} onChange={(e) => setS({ ...s, criteria: { ...s.criteria, inactiveDays: Number(e.target.value) } })} />
              </Field>
              <Field label="Minimum days between reminders">
                <Input type="number" min={1} max={90} value={s.minDaysBetween} onChange={(e) => setS({ ...s, minDaysBetween: Number(e.target.value) })} />
              </Field>
              <Field label="Day">
                <Select value={s.schedule.dayOfWeek} onChange={(e) => setS({ ...s, schedule: { ...s.schedule, dayOfWeek: Number(e.target.value) } })}>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      Every {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Time (your company timezone)">
                <Select value={s.schedule.hour} onChange={(e) => setS({ ...s, schedule: { ...s.schedule, hour: Number(e.target.value) } })}>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="eyebrow mt-2">Channels</div>
            <ToggleRow title="Email" sub={data.emailConfigured ? "Sent to the employee's work email" : "Email sending is not configured on the server yet"} checked={s.channels.email} onChange={(v) => setS({ ...s, channels: { ...s.channels, email: v } })} locked={data.features.email ? undefined : "Not in your plan"} />
            <ToggleRow
              title="WhatsApp"
              sub={data.whatsapp.configured ? `Using ${data.whatsapp.source === "company" ? "your" : "Beno's"} WhatsApp Business number` : "Needs WhatsApp Business API details (below)"}
              checked={s.channels.whatsapp}
              onChange={(v) => setS({ ...s, channels: { ...s.channels, whatsapp: v } })}
              locked={data.features.whatsapp ? undefined : "Not in your plan"}
            />
          </div>
        </Panel>
        {data.features.whatsapp && (
          <Panel>
            <PanelHeader title="WhatsApp Business API" sub="Messages use a Meta-approved template. Meta charges per delivered message; those charges are billed by Meta / your provider." />
            <div className="flex flex-col gap-3 px-5 pb-5">
              <ToggleRow title="Use our own WhatsApp number" sub="Otherwise Beno's platform number is used (if Beno has set one up)" checked={wa.useOwn} onChange={(v) => setWa({ ...wa, useOwn: v })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone number ID">
                  <Input value={wa.phoneNumberId} onChange={(e) => setWa({ ...wa, phoneNumberId: e.target.value })} disabled={!wa.useOwn} />
                </Field>
                <Field label="Template name" hint="Body variables: {{1}} first name, {{2}} card link">
                  <Input value={wa.templateName} onChange={(e) => setWa({ ...wa, templateName: e.target.value })} disabled={!wa.useOwn} />
                </Field>
                <Field label="Template language">
                  <Input value={wa.templateLang} onChange={(e) => setWa({ ...wa, templateLang: e.target.value })} disabled={!wa.useOwn} placeholder="en" />
                </Field>
                <Field label="Permanent access token" hint={data.whatsapp.hasToken ? "Saved (encrypted). Enter a new one to replace it." : "Stored encrypted"}>
                  <Input type="password" autoComplete="off" value={wa.accessToken} onChange={(e) => setWa({ ...wa, accessToken: e.target.value })} disabled={!wa.useOwn} placeholder={data.whatsapp.hasToken ? "••••••••" : ""} />
                </Field>
              </div>
              <div>
                <Button
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.put("/org/settings/whatsapp", { ...wa, accessToken: wa.accessToken || undefined });
                      toast.success("WhatsApp settings saved");
                      reload();
                    } catch (e) {
                      toast.error(errMsg(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  loading={busy}
                >
                  Save WhatsApp settings
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
      <Panel className="mt-4">
        <PanelHeader title="Recent messages" sub="Last 50 reminder attempts. Skipped means nothing was sent (and nothing was charged)." />
        {data.logs.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted">No reminders sent yet.</p>
        ) : (
          <Table minWidth={700}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Employee</Th>
                <Th>Channel</Th>
                <Th>Result</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((l) => (
                <tr key={l._id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDate(l.createdAt, true)}</Td>
                  <Td className="font-semibold">{l.employeeName}</Td>
                  <Td className="capitalize">{l.channel}</Td>
                  <Td>{l.status === "sent" ? <Chip tone="ok">Sent</Chip> : l.status === "failed" ? <Chip tone="bad">Failed</Chip> : <Chip>Skipped</Chip>}</Td>
                  <Td className="text-muted">{l.reason || l.to}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
