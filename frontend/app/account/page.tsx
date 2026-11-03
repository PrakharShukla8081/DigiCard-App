"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api, errMsg, setAccessToken } from "@/lib/api";
import { useAuth, homeFor } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader, PageLoader, Panel, PanelHeader, useConfirm } from "@/components/ui/misc";
import { PasswordRules, passwordProblem } from "@/components/shell/password-rules";
import { Logo } from "@/components/shell/logo";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/login?next=/account");
  }, [loading, session, router]);
  if (loading || !session) return <PageLoader />;

  async function change(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordProblem(pw, pw2);
    if (p) return toast.error(p);
    setBusy(true);
    try {
      const r = await api.post<{ accessToken: string }>("/auth/change-password", { currentPassword: cur, newPassword: pw });
      setAccessToken(r.data.accessToken);
      setCur("");
      setPw("");
      setPw2("");
      toast.success("Password changed. Other devices have been signed out.");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-pad mx-auto max-w-2xl py-6">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <Link href={homeFor(session.user.role)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>
      <PageHeader title="Account" sub={`${session.user.name} · ${session.user.email}`} />
      <Panel>
        <PanelHeader title="Change password" />
        <form onSubmit={change} className="grid gap-4 px-5 pb-5">
          <Field label="Current password" htmlFor="cur">
            <Input id="cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="pw">
              <Input id="pw" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw2">
              <Input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
          </div>
          <PasswordRules value={pw} />
          <div>
            <Button type="submit" variant="primary" loading={busy}>
              Update password
            </Button>
          </div>
        </form>
      </Panel>
      <Panel className="mt-4">
        <PanelHeader title="Sessions" sub="Sign out of every browser and phone where you are logged in." />
        <div className="flex gap-2 px-5 pb-5">
          <Button
            variant="danger-outline"
            onClick={async () => {
              if (!(await confirm({ title: "Sign out everywhere?", body: "You will need to log in again on every device, including this one.", confirmLabel: "Sign out everywhere", danger: true }))) return;
              await api.post("/auth/logout-all").catch(() => {});
              await logout();
            }}
          >
            Sign out everywhere
          </Button>
          <Button onClick={logout}>Log out</Button>
        </div>
      </Panel>
    </div>
  );
}
