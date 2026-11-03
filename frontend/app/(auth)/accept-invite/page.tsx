"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errMsg, type SessionData } from "@/lib/api";
import { useAuth, homeFor } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/misc";
import { PasswordRules, passwordProblem } from "@/components/shell/password-rules";

type InviteInfo = { name: string; email: string; role: string; organizationName: string | null };

export default function AcceptInvitePage() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const { applySession } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return setLoadError("This invite link is incomplete. Open the link from your email again.");
    api
      .get<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`)
      .then((d) => {
        setInfo(d);
        setName(d.name);
      })
      .catch((e) => setLoadError(errMsg(e)));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password, confirm);
    if (p) return setError(p);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<SessionData>("/auth/accept-invite", { token, password, name: name.trim() });
      applySession(res.data);
      router.replace(homeFor(res.data.user.role));
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] font-bold">Invite not valid</h1>
        <p className="text-muted">{loadError}</p>
      </div>
    );
  if (!info) return <PageLoader />;

  const where = info.role === "super_admin" ? "the Beno platform" : info.role === "employee" ? `your ${info.organizationName} digital card` : `the ${info.organizationName} admin panel`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Welcome, {info.name.split(" ")[0]}</h1>
        <p className="mt-1 text-muted">Set a password to access {where}.</p>
      </div>
      {error && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">{error}</p>}
      <Field label="Email">
        <Input value={info.email} disabled />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Password" htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <PasswordRules value={password} />
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        Set password and continue
      </Button>
    </form>
  );
}
