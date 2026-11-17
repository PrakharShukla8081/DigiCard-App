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

type TwoFactorStatus = { enabled: boolean; required: boolean };
type TwoFactorSetup = { secret: string; qrDataUrl: string };

export default function AccountPage() {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => {
    if (!loading && !session) router.replace("/login?next=/account");
  }, [loading, session, router]);

  useEffect(() => {
    if (!session || session.user.role === "employee") return;
    let active = true;
    api.get<TwoFactorStatus>("/auth/2fa/status")
      .then((status) => { if (active) setTwoFactor(status); })
      .catch((err) => { if (active) setTwoFactorError(errMsg(err)); });
    return () => { active = false; };
  }, [session?.user.id, session?.user.role]);

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

  async function beginTwoFactorSetup() {
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      const result = await api.post<TwoFactorSetup>("/auth/2fa/setup");
      setSetup(result.data);
      setCode("");
    } catch (err) {
      setTwoFactorError(errMsg(err));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function enableTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      const result = await api.post<{ enabled: true; recoveryCodes: string[] }>("/auth/2fa/enable", { code });
      setTwoFactor({ enabled: true, required: Boolean(twoFactor?.required) });
      setRecoveryCodes(result.data.recoveryCodes);
      setSetup(null);
      setCode("");
      toast.success("Two-factor authentication enabled");
    } catch (err) {
      setTwoFactorError(errMsg(err));
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setTwoFactorBusy(true);
    setTwoFactorError(null);
    try {
      await api.post("/auth/2fa/disable", { password: disablePassword, code: disableCode });
      setTwoFactor({ enabled: false, required: Boolean(twoFactor?.required) });
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes([]);
      toast.success("Two-factor authentication disabled");
    } catch (err) {
      setTwoFactorError(errMsg(err));
    } finally {
      setTwoFactorBusy(false);
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
      {session.user.role !== "employee" && (
        <Panel className="mt-4">
          <PanelHeader title="Two-factor authentication" sub="Use an authenticator app as a second step when signing in." />
          <div className="grid gap-4 px-5 pb-5">
            {twoFactorError && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{twoFactorError}</p>}
            {twoFactor?.required && <p className="text-sm font-semibold text-accent">Two-factor authentication is required for Super Admin accounts.</p>}
            {twoFactor?.enabled ? (
              <>
                <p className="text-sm font-semibold text-ok">Two-factor authentication is enabled.</p>
                {recoveryCodes.length > 0 && (
                  <div className="rounded-xl border border-line bg-surface p-4">
                    <p className="text-sm font-bold">Save your recovery codes</p>
                    <p className="mt-1 text-xs text-muted">Each code works once. They will not be shown again.</p>
                    <div className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
                      {recoveryCodes.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}
                    </div>
                  </div>
                )}
                {twoFactor.required ? (
                  <p className="text-sm text-muted">This setting is enforced by your platform administrator and cannot be disabled here.</p>
                ) : (
                  <form onSubmit={disableTwoFactor} className="grid gap-4 border-t border-line pt-4">
                    <p className="text-sm font-semibold">To disable 2FA, confirm your password and an authenticator or unused recovery code.</p>
                    <Field label="Current password" htmlFor="two-factor-password">
                      <Input id="two-factor-password" type="password" autoComplete="current-password" required value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
                    </Field>
                    <Field label="Authenticator or recovery code" htmlFor="two-factor-disable-code">
                      <Input id="two-factor-disable-code" autoComplete="one-time-code" required value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
                    </Field>
                    <div><Button type="submit" variant="danger-outline" loading={twoFactorBusy}>Disable 2FA</Button></div>
                  </form>
                )}
              </>
            ) : setup ? (
              <form onSubmit={enableTwoFactor} className="grid gap-4">
                <p className="text-sm">Scan this QR code with your authenticator app, or enter the secret manually.</p>
                <img src={setup.qrDataUrl} alt="Two-factor setup QR code" className="size-56 rounded-lg border border-line bg-white p-2" />
                <p className="break-all rounded-lg bg-surface p-3 font-mono text-sm">{setup.secret}</p>
                <Field label="6-digit authenticator code" htmlFor="two-factor-enable-code">
                  <Input id="two-factor-enable-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" loading={twoFactorBusy}>Confirm and enable</Button>
                  <Button type="button" onClick={() => { setSetup(null); setCode(""); }}>Cancel setup</Button>
                </div>
              </form>
            ) : (
              <div>
                <p className="mb-3 text-sm text-muted">Add a one-time code from an authenticator app to protect your sign-in.</p>
                <Button onClick={beginTwoFactorSetup} loading={twoFactorBusy}>Set up 2FA</Button>
              </div>
            )}
          </div>
        </Panel>
      )}
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
