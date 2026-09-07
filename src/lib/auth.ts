import { cookies } from "next/headers";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { all, one, run, nowIso } from "./db";
import { newId, sha256 } from "./ids";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "tj_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* passwords                                                           */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/**
 * A real scrypt hash used when the email is unknown, so a failed sign-in costs
 * the same either way. Without it, response time alone tells an attacker which
 * addresses have accounts.
 */
let decoyHash: Promise<string> | null = null;

export async function verifyAgainstDecoy(password: string): Promise<false> {
  if (!decoyHash) decoyHash = hashPassword("decoy-password-never-matches");
  await verifyPassword(password, await decoyHash);
  return false;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailProblem(email: string): string | null {
  const value = normalizeEmail(email);
  if (!value) return "Email is required.";
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value)) return "That does not look like an email address.";
  if (value.length > 254) return "Email is too long.";
  return null;
}

/* ------------------------------------------------------------------ */
/* sessions                                                            */
/* ------------------------------------------------------------------ */

/** Clears sessions that have already expired. Cheap, and keeps the table tidy. */
export async function pruneExpiredSessions(): Promise<void> {
  await run(`DELETE FROM sessions WHERE expires_at < ?`, [nowIso()]);
}

export async function createSession(userId: string, userAgent = ""): Promise<void> {
  // Signing in is a natural, infrequent moment to take out the rubbish.
  await pruneExpiredSessions().catch(() => {});

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [sha256(token), userId, nowIso(), expires.toISOString(), userAgent.slice(0, 200)],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run(`DELETE FROM sessions WHERE token_hash = ?`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Every read is scoped by the returned id. */
export async function getUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await one<User & { expires_at: string }>(
    `SELECT u.id, u.email, u.name, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [sha256(token)],
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await run(`DELETE FROM sessions WHERE token_hash = ?`, [sha256(token)]);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export class Unauthorized extends Error {
  constructor() {
    super("Not signed in");
  }
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) throw new Unauthorized();
  return user;
}

/* ------------------------------------------------------------------ */
/* registration                                                        */
/* ------------------------------------------------------------------ */

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const id = newId("u_");
  const ts = nowIso();
  await run(
    `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, normalizeEmail(email), name.trim().slice(0, 80), await hashPassword(password), ts, ts],
  );
  // Every new account starts with one empty trading account and zero trades.
  await run(
    `INSERT INTO accounts (id, user_id, name, broker, kind, currency, starting_balance,
                           risk_mode, risk_value, timezone, is_default, archived, created_at, updated_at)
     VALUES (?, ?, 'Main Account', '', 'paper', 'USD', 0, 'fixed', 0, 'UTC', 1, 0, ?, ?)`,
    [newId("a_"), id, ts, ts],
  );
  return { id, email: normalizeEmail(email), name: name.trim(), created_at: ts };
}

export async function findUserByEmail(email: string) {
  return one<{ id: string; email: string; name: string; password_hash: string; created_at: string }>(
    `SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?`,
    [normalizeEmail(email)],
  );
}

export async function userExists(): Promise<boolean> {
  const rows = await all<{ n: number }>(`SELECT COUNT(*) AS n FROM users`);
  return Number(rows[0]?.n ?? 0) > 0;
}
