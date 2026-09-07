import { NextResponse } from "next/server";
import { Unauthorized } from "./auth";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a route handler so thrown errors become clean JSON instead of a 500 page. */
export async function guard<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Unauthorized) return fail("You need to sign in.", 401);
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", err);
    return fail(message, 500);
  }
}

/** Small in-memory throttle — enough to blunt password guessing on one instance. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function throttle(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (hits.size > 5000) hits.clear();
  return entry.count <= limit;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

export function numeric(value: unknown, fallback: number | null = null): number | null {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
