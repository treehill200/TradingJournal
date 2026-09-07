import { all, one, run, nowIso } from "./db";
import { newId } from "./ids";
import type { Account, BalanceEvent, DayEntry, DayNote, ImportRecord, Trade } from "./types";

/* Every query here takes a user id and filters on it — that is what keeps one
   user's journal completely invisible to another. */

export async function listAccounts(userId: string): Promise<Account[]> {
  return all<Account>(
    `SELECT * FROM accounts WHERE user_id = ? ORDER BY archived ASC, is_default DESC, created_at ASC`,
    [userId],
  );
}

export async function getAccount(userId: string, accountId: string): Promise<Account | null> {
  return one<Account>(`SELECT * FROM accounts WHERE user_id = ? AND id = ?`, [userId, accountId]);
}

/** The requested account, or the default one, creating a first account if needed. */
export async function resolveAccount(userId: string, accountId?: string | null): Promise<Account> {
  if (accountId) {
    const found = await getAccount(userId, accountId);
    if (found) return found;
  }
  const accounts = await listAccounts(userId);
  const active = accounts.find((a) => !a.archived) ?? accounts[0];
  if (active) return active;

  const ts = nowIso();
  const id = newId("a_");
  await run(
    `INSERT INTO accounts (id, user_id, name, broker, kind, currency, starting_balance,
                           risk_mode, risk_value, timezone, is_default, archived, created_at, updated_at)
     VALUES (?, ?, 'Main Account', '', 'paper', 'USD', 0, 'fixed', 0, 'UTC', 1, 0, ?, ?)`,
    [id, userId, ts, ts],
  );
  return (await getAccount(userId, id))!;
}

export async function listTrades(userId: string, accountId: string): Promise<Trade[]> {
  return all<Trade>(
    `SELECT id, account_id, symbol, side, quantity, entry_price, exit_price, stop_price,
            opened_at, closed_at, close_date, gross_pnl, fees, net_pnl, risk_amount,
            r_multiple, tags, notes, source
       FROM trades
      WHERE user_id = ? AND account_id = ?
      ORDER BY closed_at ASC, id ASC`,
    [userId, accountId],
  );
}

export async function listBalanceEvents(userId: string, accountId: string): Promise<BalanceEvent[]> {
  return all<BalanceEvent>(
    `SELECT id, account_id, kind, amount, balance, occurred_at, event_date, note, source
       FROM balance_events
      WHERE user_id = ? AND account_id = ?
      ORDER BY occurred_at ASC`,
    [userId, accountId],
  );
}

export async function listDayEntries(userId: string, accountId: string): Promise<DayEntry[]> {
  return all<DayEntry>(
    `SELECT id, account_id, date, net_pnl, trades, wins, losses, r_multiple
       FROM day_entries WHERE user_id = ? AND account_id = ? ORDER BY date ASC`,
    [userId, accountId],
  );
}

export async function listNotes(userId: string, accountId: string): Promise<DayNote[]> {
  return all<DayNote>(
    `SELECT id, account_id, date, title, body, mood, rating, tags, updated_at
       FROM day_notes WHERE user_id = ? AND account_id = ? ORDER BY date DESC`,
    [userId, accountId],
  );
}

export async function listImports(userId: string, accountId: string): Promise<ImportRecord[]> {
  return all<ImportRecord>(
    `SELECT id, filename, dataset, format, rows_read, inserted, duplicates, skipped, created_at
       FROM imports WHERE user_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 25`,
    [userId, accountId],
  );
}

export type Workspace = {
  account: Account;
  accounts: Account[];
  trades: Trade[];
  events: BalanceEvent[];
  dayEntries: DayEntry[];
  notes: DayNote[];
};

/** One round trip that loads everything the dashboard needs. */
export async function loadWorkspace(userId: string, accountId?: string | null): Promise<Workspace> {
  const accounts = await listAccounts(userId);
  const account = await resolveAccount(userId, accountId);
  const [trades, events, dayEntries, notes] = await Promise.all([
    listTrades(userId, account.id),
    listBalanceEvents(userId, account.id),
    listDayEntries(userId, account.id),
    listNotes(userId, account.id),
  ]);
  return { account, accounts, trades, events, dayEntries, notes };
}
