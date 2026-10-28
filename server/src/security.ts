import type { NextFunction, Request, Response } from "express";

const MINUTE = 60_000;

/** Fixed-window limiter per client IP. Use `trust proxy` so req.ip is the real client. */
export function rateLimit(perMinute: number, message = "Too many requests. Wait a minute and try again.") {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt < now) hits.delete(ip);
  }, MINUTE).unref();

  const check = (req: Request) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + MINUTE });
      return 0;
    }
    entry.count++;
    return entry.count > perMinute ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  };

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const retryAfter = check(req);
    if (!retryAfter) return next();
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: message });
  };
  /** Counts one hit; returns seconds to wait if over the limit, else 0. */
  middleware.check = check;
  return middleware;
}

/** True only for https URLs on an allowed host (no internal addresses, no other schemes). */
export function isAllowedStreamUrl(raw: string, hosts: string[]) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && hosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data:",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Baseline browser protections for every response. */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // API responses are data only; pages get a policy that allows the app and its fonts.
  res.setHeader("Content-Security-Policy", req.path.startsWith("/api/") ? "default-src 'none'; frame-ancestors 'none'; sandbox" : CSP);
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
