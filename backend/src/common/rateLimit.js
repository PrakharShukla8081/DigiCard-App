import { tooMany } from "./errors.js";

/**
 * Small in-memory fixed-window rate limiter (no extra dependency).
 * Good for a single server instance. When you scale to several instances,
 * replace the store with Redis.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message, skip }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  timer.unref?.();

  return (req, res, next) => {
    if (process.env.NODE_ENV === "test" && !req.headers["x-test-ratelimit"]) return next();
    if (skip && skip(req)) return next();
    const k = key(req);
    const now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset <= now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(k, h);
    }
    h.count += 1;
    res.setHeader("RateLimit-Remaining", Math.max(0, max - h.count));
    if (h.count > max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      return next(tooMany(message));
    }
    next();
  };
}
