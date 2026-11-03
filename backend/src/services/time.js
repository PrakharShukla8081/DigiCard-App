import { env } from "../config/env.js";

/** YYYY-MM-DD for a date in a given IANA timezone (default Asia/Kolkata). */
export function dayKey(date = new Date(), tz = env.defaultTimezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Add n days to a YYYY-MM-DD key. */
export function addDaysKey(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day key from `from` to `to` inclusive. */
export function dayRange(from, to) {
  const out = [];
  let k = from;
  let guard = 0;
  while (k <= to && guard++ < 1000) {
    out.push(k);
    k = addDaysKey(k, 1);
  }
  return out;
}

/** Weekday (0-6) and hour (0-23) in a timezone. */
export function localParts(date = new Date(), tz = env.defaultTimezone) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { dayOfWeek: dow, hour: Number(parts.hour) % 24 };
}
