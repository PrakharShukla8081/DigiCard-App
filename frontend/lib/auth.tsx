"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, refreshSession, setAccessToken, setSessionLostHandler, type SessionData } from "./api";

type Role = SessionData["user"]["role"];
type Ctx = {
  session: SessionData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionData>;
  applySession: (s: SessionData) => void;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  hasFeature: (key: string) => boolean;
};

const AuthCtx = createContext<Ctx | null>(null);

export const homeFor = (role?: Role) => (role === "super_admin" ? "/platform" : role === "company_admin" ? "/admin" : role === "employee" ? "/me" : "/login");

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const applySession = useCallback((s: SessionData) => {
    setAccessToken(s.accessToken);
    setSession(s);
  }, []);

  useEffect(() => {
    let alive = true;
    setSessionLostHandler(() => {
      setAccessToken(null);
      setSession(null);
      const here = window.location.pathname + window.location.search;
      if (!here.startsWith("/login")) router.replace(`/login?next=${encodeURIComponent(here)}`);
    });
    // Only try to restore a session where one may exist (avoids a 401 on public pages).
    if (!document.cookie.includes("bdc_session=") && !/^\/(platform|admin|me|account)/.test(window.location.pathname)) {
      setLoading(false);
      return;
    }
    refreshSession().then((s) => {
      if (!alive) return;
      if (s) applySession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [applySession, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<SessionData>("/auth/login", { email, password });
      applySession(res.data);
      return res.data;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setAccessToken(null);
    // Full page load: clears every in-memory state and avoids pages redirecting with ?next=
    window.location.replace("/login");
  }, []);

  const reload = useCallback(async () => {
    const data = await api.get<Omit<SessionData, "accessToken">>("/auth/me");
    setSession((s) => (s ? { ...s, ...data } : s));
  }, []);

  const hasFeature = useCallback((key: string) => Boolean(session?.subscription?.features?.[key]), [session]);

  const value = useMemo(() => ({ session, loading, login, applySession, logout, reload, hasFeature }), [session, loading, login, applySession, logout, reload, hasFeature]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
