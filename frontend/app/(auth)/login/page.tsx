"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, homeFor } from "@/lib/auth";
import { api, errMsg } from "@/lib/api";
import type { SessionData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function LoginPage() {
  const { login, applySession, session, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  useEffect(() => {
    if (!loading && session) router.replace(safeNext || homeFor(session.user.role));
  }, [loading, session, router, safeNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challengeToken) {
        const res = await api.post<SessionData>("/auth/2fa", { challengeToken, code: code.trim() });
        applySession(res.data);
        router.replace(safeNext || homeFor(res.data.user.role));
      } else {
        const result = await login(email.trim(), password);
        if ("challengeRequired" in result) {
          setChallengeToken(result.challengeToken);
          setPassword("");
          setCode("");
        } else {
          router.replace(safeNext || homeFor(result.user.role));
        }
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">{challengeToken ? "Verify your identity" : "Log in"}</h1>
        <p className="mt-1 text-muted">{challengeToken ? "Enter a 6-digit authenticator code or an unused recovery code." : "Super Admin, company admins and employees all sign in here."}</p>
      </div>
      {error && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{error}</p>}
      {challengeToken ? (
        <>
          <Field label="Authenticator or recovery code" htmlFor="code">
            <Input id="code" type="text" autoComplete="one-time-code" autoCapitalize="characters" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            Verify and log in
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setChallengeToken(""); setCode(""); setError(null); }}>
            Back to login
          </Button>
        </>
      ) : (
        <>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            right={
              <Link href="/forgot-password" className="text-[12px] font-semibold text-accent hover:underline">
                Forgot password?
              </Link>
            }
          >
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy}>
            Log in
          </Button>
          <p className="text-[13px] text-muted">New here? Your company admin or Beno sends you an invite email to set your password.</p>
        </>
      )}
    </form>
  );
}
