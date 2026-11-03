"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[28px] font-bold">Check your email</h1>
        <p className="text-muted">If an account exists for {email}, we sent a link to reset the password. The link works for 30 minutes.</p>
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Back to log in
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Reset your password</h1>
        <p className="mt-1 text-muted">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      {error && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{error}</p>}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Send reset link
      </Button>
      <Link href="/login" className="text-[13px] font-semibold text-accent hover:underline">
        Back to log in
      </Link>
    </form>
  );
}
