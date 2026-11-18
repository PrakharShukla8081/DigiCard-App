"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, UserPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { fmtDate } from "@/lib/utils";
import type { Invite } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Chip, Dialog, ErrorBox, InviteResult, PageHeader, PageLoader, Panel, PanelHeader } from "@/components/ui/misc";

type Settings = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  defaultTrialDays: number;
  poweredByText: string;
  expiryReminderDays: number;
  require2faForSuperAdmin: boolean;
  enquiryRetentionDays: number;
  leadRetentionDays: number;
};
type EmailStatus = { provider: "resend" | "gmail"; sentToday: number; dailyLimit: number; queued: number; failed: number };
type EmailSendResult = { sent: boolean; queued?: boolean; reason?: string };
type Admin = { _id: string; name: string; email: string; status: string; lastLoginAt: string | null };

export default function PlatformSettingsPage() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [settingsResponse, admins] = await Promise.all([
      api.get<Settings & { emailStatus: EmailStatus }>("/platform/settings"),
      api.get<Admin[]>("/platform/admins"),
    ]);
    const { emailStatus, ...settings } = settingsResponse;
    return { settings, emailStatus, admins };
  });
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [na, setNa] = useState({ name: "", email: "" });
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !form) return null;

  async function save() {
    setBusy(true);
    try {
      await api.put("/platform/settings", {
        ...form,
        defaultTrialDays: Number(form!.defaultTrialDays),
        expiryReminderDays: Number(form!.expiryReminderDays),
        enquiryRetentionDays: Number(form!.enquiryRetentionDays),
        leadRetentionDays: Number(form!.leadRetentionDays),
      });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTestEmail() {
    setEmailBusy(true);
    try {
      const result = await api.post<EmailSendResult>("/platform/settings/test-email", {});
      if (result.data.sent) toast.success("Test email sent to your account.");
      else if (result.data.queued) toast.success("Test email queued and will be sent automatically.");
      else toast.error(result.data.reason || "The test email could not be sent.");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Beno Super Admin"
        title="Platform settings"
        actions={
          <Button variant="primary" onClick={save} loading={busy}>
            Save settings
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="General" />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Platform name" className="sm:col-span-2">
              <Input value={form.platformName} onChange={(e) => setForm({ ...form, platformName: e.target.value })} />
            </Field>
            <Field label="Support email">
              <Input type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
            </Field>
            <Field label="Support phone">
              <Input value={form.supportPhone} onChange={(e) => setForm({ ...form, supportPhone: e.target.value })} />
            </Field>
            <Field label="Card footer text" className="sm:col-span-2" hint="Shown at the bottom of cards unless the plan includes 'Hide Powered by'">
              <Input value={form.poweredByText} onChange={(e) => setForm({ ...form, poweredByText: e.target.value })} />
            </Field>
            <Field label="Default trial length (days)">
              <Input type="number" min={1} value={form.defaultTrialDays} onChange={(e) => setForm({ ...form, defaultTrialDays: Number(e.target.value) })} />
            </Field>
            <Field label="Warn admins before expiry (days)">
              <Input type="number" min={1} value={form.expiryReminderDays} onChange={(e) => setForm({ ...form, expiryReminderDays: Number(e.target.value) })} />
            </Field>
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Super Admin team"
            sub="People at Beno with access to every company."
            actions={
              <Button size="sm" onClick={() => (setNa({ name: "", email: "" }), setInvite(null), setDlg(true))}>
                <UserPlus /> Invite
              </Button>
            }
          />
          <div className="px-5 pb-4">
            {data.admins.map((a) => (
              <div key={a._id} className="flex items-center justify-between gap-2 border-t border-line py-3 first:border-t-0">
                <div className="min-w-0">
                  <div className="font-semibold">{a.name}</div>
                  <div className="truncate text-[12px] text-muted">
                    {a.email} · last login {fmtDate(a.lastLoginAt)}
                  </div>
                </div>
                {a.status === "active" ? <Chip tone="ok">Active</Chip> : a.status === "invited" ? <Chip tone="warn">Invited</Chip> : <Chip tone="bad">Disabled</Chip>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Security and data retention" />
          <div className="grid gap-4 px-5 pb-5">
            <Checkbox
              checked={form.require2faForSuperAdmin}
              onChange={(e) => setForm({ ...form, require2faForSuperAdmin: e.target.checked })}
              label="Require 2FA for Super Admin sign-ins"
            />
            <Field label="Keep enquiries for (days)">
              <Input type="number" min={1} max={3650} value={form.enquiryRetentionDays} onChange={(e) => setForm({ ...form, enquiryRetentionDays: Number(e.target.value) })} />
            </Field>
            <Field label="Keep website leads for (days)">
              <Input type="number" min={1} max={3650} value={form.leadRetentionDays} onChange={(e) => setForm({ ...form, leadRetentionDays: Number(e.target.value) })} />
            </Field>
            <p className="text-xs text-muted">Enquiries include contact exchange submissions. Expired records are removed by the daily retention job.</p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Email delivery" sub="Provider and daily usage (Asia/Kolkata)." />
          <div className="grid gap-3 px-5 pb-5">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span>Provider: <b className="capitalize">{data.emailStatus.provider}</b></span>
              <span>Sent today: <b>{data.emailStatus.sentToday} / {data.emailStatus.dailyLimit}</b></span>
              <span>Queued: <b>{data.emailStatus.queued}</b></span>
              <span>Failed: <b>{data.emailStatus.failed}</b></span>
            </div>
            <div>
              <Button onClick={sendTestEmail} loading={emailBusy}>
                <Mail /> Send test email
              </Button>
            </div>
          </div>
        </Panel>
      </div>
      <Dialog
        open={dlg}
        onOpenChange={setDlg}
        title={invite ? "Invite link" : "Invite a Super Admin"}
        sub={invite ? undefined : "Super Admins can see and change every company. Invite only Beno staff."}
        footer={
          invite ? (
            <Button variant="primary" onClick={() => setDlg(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setDlg(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api.post<{ invite: Invite }>("/platform/admins", na);
                    setInvite(r.data.invite);
                    reload();
                  } catch (e) {
                    toast.error(errMsg(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send invite
              </Button>
            </>
          )
        }
      >
        {invite ? (
          <InviteResult invite={invite} email={na.email} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={na.name} onChange={(e) => setNa({ ...na, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={na.email} onChange={(e) => setNa({ ...na, email: e.target.value })} />
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
