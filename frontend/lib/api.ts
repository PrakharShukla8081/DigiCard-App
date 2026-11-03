"use client";

/**
 * Browser API client.
 * - Access token lives only in memory (never localStorage).
 * - Refresh token is an HttpOnly cookie set by the backend; /api/auth/refresh rotates it.
 * - On a 401 the client refreshes once and retries the request.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: { field: string; message: string }[];
  constructor(status: number, message: string, code?: string, details?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionData | null> | null = null;
let onSessionLost: (() => void) | null = null;

export type SessionData = {
  accessToken: string;
  user: { id: string; name: string; email: string; role: "super_admin" | "company_admin" | "employee"; organizationId: string | null; employeeId: string | null };
  organization: { id: string; name: string; slug: string; status: string; logoUrl: string; primaryColor: string } | null;
  subscription: { status: string; active: boolean; planName: string | null; endDate: string | null; employeeLimit: number | null; features: Record<string, boolean> } | null;
};

export const setAccessToken = (t: string | null) => (accessToken = t);
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

export async function refreshSession(): Promise<SessionData | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
        if (!res.ok) return null;
        const json = await res.json();
        accessToken = json.data.accessToken;
        return json.data as SessionData;
      } catch {
        return null;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; retry?: boolean; signal?: AbortSignal };

async function raw(path: string, { method = "GET", body, form, retry = true, signal }: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the server. Check your internet connection and try again.");
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    const s = await refreshSession();
    if (s) return raw(path, { method, body, form, retry: false, signal });
    onSessionLost?.();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.message || `Request failed (${res.status})`, json.code, json.details);
  return json as T;
}

export type Paged<T> = { data: T[]; pagination: { page: number; limit: number; total: number } };

export const api = {
  get: async <T = unknown>(path: string, signal?: AbortSignal) => (await parse<{ data: T }>(await raw(path, { signal }))).data,
  getPaged: async <T = unknown>(path: string) => parse<Paged<T>>(await raw(path)),
  getFull: async <T = unknown>(path: string) => parse<T>(await raw(path)),
  post: async <T = unknown>(path: string, body?: unknown) => (await parse<{ data: T; message?: string }>(await raw(path, { method: "POST", body: body ?? {} }))),
  put: async <T = unknown>(path: string, body?: unknown) => (await parse<{ data: T }>(await raw(path, { method: "PUT", body: body ?? {} }))).data,
  patch: async <T = unknown>(path: string, body?: unknown) => (await parse<{ data: T }>(await raw(path, { method: "PATCH", body: body ?? {} }))).data,
  del: async <T = unknown>(path: string) => parse<{ data?: T; message?: string }>(await raw(path, { method: "DELETE" })),
  upload: async <T = unknown>(path: string, file: File, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return (await parse<{ data: T }>(await raw(path, { method: "POST", form }))).data;
  },
  /** Download a protected file (adds the auth header) and save it. */
  download: async (path: string, fallbackName = "download") => {
    const res = await raw(path);
    if (!res.ok) {
      await parse(res);
      return;
    }
    const cd = res.headers.get("content-disposition") || "";
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
