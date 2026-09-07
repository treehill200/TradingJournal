import { createClient, type Client, type InValue } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * The journal runs on SQLite through libSQL.
 *
 *  - Local / self-hosted:  DATABASE_URL=file:./data/journal.db  (a real file on disk)
 *  - Serverless (Vercel):  DATABASE_URL=libsql://<db>.turso.io + DATABASE_AUTH_TOKEN
 *
 * Both speak the exact same SQL, so nothing else in the app has to care.
 */

const DEFAULT_FILE = "file:./data/journal.db";

let client: Client | null = null;
let migrated: Promise<void> | null = null;

function resolveUrl(): string {
  const url = process.env.DATABASE_URL?.trim() || DEFAULT_FILE;
  if (url.startsWith("file:")) {
    // Make the path absolute so it does not move around with the cwd, and make
    // sure the directory exists before libSQL tries to open the file.
    const rel = url.slice("file:".length);
    const abs = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return `file:${abs}`;
  }
  return url;
}

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: resolveUrl(),
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return client;
}

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  broker           TEXT NOT NULL DEFAULT '',
  kind             TEXT NOT NULL DEFAULT 'paper',      -- paper | live
  currency         TEXT NOT NULL DEFAULT 'USD',
  starting_balance REAL NOT NULL DEFAULT 0,
  risk_mode        TEXT NOT NULL DEFAULT 'fixed',      -- fixed | percent
  risk_value       REAL NOT NULL DEFAULT 0,            -- $ per R, or % of balance per R
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  is_default       INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS trades (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  dedupe_key  TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  side        TEXT NOT NULL DEFAULT 'long',            -- long | short
  quantity    REAL NOT NULL DEFAULT 0,
  entry_price REAL,
  exit_price  REAL,
  stop_price  REAL,
  opened_at   TEXT,                                    -- ISO timestamp
  closed_at   TEXT NOT NULL,                           -- ISO timestamp
  close_date  TEXT NOT NULL,                           -- YYYY-MM-DD, the spreadsheet's closing date
  gross_pnl   REAL NOT NULL DEFAULT 0,
  fees        REAL NOT NULL DEFAULT 0,                 -- commission + swap + other costs
  net_pnl     REAL NOT NULL DEFAULT 0,
  risk_amount REAL,                                    -- $ risked, when known
  r_multiple  REAL,
  tags        TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual',          -- tradingview | manual
  import_id   TEXT,
  raw         TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_dedupe ON trades(account_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_trades_day ON trades(user_id, account_id, close_date);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(user_id, symbol);

CREATE TABLE IF NOT EXISTS balance_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  dedupe_key  TEXT NOT NULL,
  kind        TEXT NOT NULL,                           -- deposit | withdrawal | fee | interest | dividend | adjustment | pnl | unknown
  amount      REAL NOT NULL DEFAULT 0,
  balance     REAL,                                    -- broker-reported running balance, if present
  occurred_at TEXT NOT NULL,
  event_date  TEXT NOT NULL,                           -- YYYY-MM-DD
  note        TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual',
  import_id   TEXT,
  raw         TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_balance_dedupe ON balance_events(account_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_balance_day ON balance_events(user_id, account_id, event_date);

-- Manual "I traded today, here are the totals" entries, for days without
-- individual trade rows. Merged with trade-derived days everywhere.
CREATE TABLE IF NOT EXISTS day_entries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  net_pnl    REAL NOT NULL DEFAULT 0,
  trades     INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  r_multiple REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_entry ON day_entries(account_id, date);

CREATE TABLE IF NOT EXISTS day_notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  mood       TEXT NOT NULL DEFAULT '',
  rating     INTEGER,
  tags       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_note ON day_notes(account_id, date);

CREATE TABLE IF NOT EXISTS imports (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL DEFAULT '',
  dataset      TEXT NOT NULL,                          -- trades | balance
  format       TEXT NOT NULL DEFAULT '',
  rows_read    INTEGER NOT NULL DEFAULT 0,
  inserted     INTEGER NOT NULL DEFAULT 0,
  duplicates   INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imports_account ON imports(account_id, created_at);
`;

async function migrate(c: Client): Promise<void> {
  for (const stmt of SCHEMA.split(";")) {
    const sql = stmt.trim();
    if (sql) await c.execute(sql);
  }
}

/** Returns a ready-to-use client, running migrations exactly once per process. */
export async function db(): Promise<Client> {
  const c = getClient();
  if (!migrated) {
    migrated = migrate(c).catch((err) => {
      migrated = null;
      throw err;
    });
  }
  await migrated;
  return c;
}

export type Row = Record<string, unknown>;

export async function all<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  const c = await db();
  const res = await c.execute({ sql, args });
  // libSQL rows are array-like objects; React server components can only hand
  // plain objects to client components, so rebuild them from the column list.
  return res.rows.map((row) => {
    const out: Row = {};
    res.columns.forEach((column, i) => {
      out[column] = row[i];
    });
    return out as T;
  });
}

export async function one<T = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows.length ? rows[0] : null;
}

export async function run(sql: string, args: InValue[] = []): Promise<void> {
  const c = await db();
  await c.execute({ sql, args });
}

/** Runs many statements in a single transaction (much faster for imports). */
export async function batch(stmts: { sql: string; args: InValue[] }[]): Promise<void> {
  if (!stmts.length) return;
  const c = await db();
  await c.batch(stmts, "write");
}

export function nowIso(): string {
  return new Date().toISOString();
}
