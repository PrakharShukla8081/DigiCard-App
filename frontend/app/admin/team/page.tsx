"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, UserPlus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLoad } from "@/lib/hooks";
import { timeAgo } from "@/lib/utils";
import type { Invite } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Avatar, Chip, Dialog, ErrorBox, InviteResult, PageHeader, PageLoader, Panel } from "@/components/ui/misc";

type U = { _id: string; name: string; email: string; status: string; lastLoginAt: string | null; invitedAt: string | null };

export default function TeamPage() {
  const { session } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get<U[]>("/org/team"));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [invite, setInvite] = useState<{ invite: Invite; email: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        eyebrow="Company Admin"
        title="Admin team"
        sub="People who can manage employees, branding and analytics for your company."
        actions={
          <Button variant="primary" onClick={() => (setForm({ name: "", email: "" }), setInvite(null), setOpen(true))}>
            <UserPlus /> Invite admin
          </Button>
        }
      />
      <Panel>
        {(data || []).map((u) => (
          <div key={u._id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={u.name} />
              <div className="min-w-0">
                <div className="font-semibold">
                  {u.name} {u._id === session?.user.id && <span className="text-[12px] text-muted">(you)</span>}
                </div>
                <div className="truncate text-[12px] text-muted">
                  {u.email} · {u.status === "invited" ? `invited ${timeAgo(u.invitedAt)}` : `last login ${timeAgo(u.lastLoginAt)}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {u.status === "active" ? <Chip tone="ok">Active</Chip> : u.status === "invited" ? <Chip tone="warn">Invited</Chip> : <Chip tone="bad">Disabled</Chip>}
              {u.status === "invited" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const r = await api.post<{ invite: Invite }>(`/org/team/${u._id}/resend-invite`);
                      setInvite({ invite: r.data.invite, email: u.email });
                      setOpen(true);
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                >
                  <RefreshCw /> Resend
                </Button>
              )}
              {u._id !== session?.user.id && u.status !== "invited" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api.patch(`/org/team/${u._id}/status`, { status: u.status === "active" ? "disabled" : "active" });
                      reload();
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                >
                  {u.status === "active" ? "Disable" : "Enable"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </Panel>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={invite ? "Invite link" : "Invite an admin"}
        footer={
          invite ? (
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api.post<{ invite: Invite }>("/org/team", form);
                    setInvite({ invite: r.data.invite, email: form.email });
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
          <InviteResult invite={invite.invite} email={invite.email} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
