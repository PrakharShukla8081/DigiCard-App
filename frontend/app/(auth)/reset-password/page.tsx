"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordRules, passwordProblem } from "@/components/shell/password-rules";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password, confirm);
    if (p) return setError(p);
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] font-bold">Link is incomplete</h1>
        <p className="text-muted">Open the reset link from your email again, or request a new one.</p>
        <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
          Request a new link
        </Link>
      </div>
    );

  if (done)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] font-bold">Password updated</h1>
        <p className="text-muted">You have been signed out on every device. Log in with your new password.</p>
        <Button asChild variant="primary" size="lg">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Choose a new password</h1>
      </div>
      {error && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{error}</p>}
      <Field label="New password" htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <PasswordRules value={password} />
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Save password
      </Button>
    </form>
  );
}
