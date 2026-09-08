import { batch, nowIso, run, all } from "./db";
import { newId } from "./ids";
import { parseDelimited } from "./csv";
import { analyze, type Analysis, type Dataset, type Field, type TradeMode } from "./tradingview";
import { CASH_FLOW_KINDS } from "./constants";
import type { Account } from "./types";

export type ImportOptions = {
  dataset?: Dataset;
  mode?: TradeMode;
  dayFirst?: boolean;
  symbol?: string;
  override?: Partial<Record<Field, string>>;
};

export type ImportReport = {
  filename: string;
  dataset: Dataset;
  mode: TradeMode;
  rowsRead: number;
  parsed: number;
  fresh: number;
  duplicates: number;
  skipped: number;
  openPositions: number;
  warnings: string[];
  headers: string[];
  mappedColumns: { field: Field; header: string }[];
  unmappedColumns: string[];
  dayFirst: boolean;
  dateRange: { from: string; to: string } | null;
  netPnl: number;
  preview: PreviewRow[];
  committed: boolean;
};

export type PreviewRow = {
  duplicate: boolean;
  date: string;
  symbol: string;
  side: string;
  quantity: number | null;
  entry: number | null;
  exit: number | null;
  amount: number;
  detail: string;
};

/**
 * Analyses an export and, when `commit` is set, writes the new rows.
 *
 * Trades are keyed by a stable dedupe key, so re-uploading yesterday's file on
 * top of today's simply reports the overlap as duplicates and inserts nothing.
 */
export async function runImport(
  userId: string,
  account: Account,
  filename: string,
  text: string,
  options: ImportOptions,
  commit: boolean,
): Promise<ImportReport> {
  const table = parseDelimited(text);
  if (!table.headers.length) {
    throw new Error("That file has no readable rows. Export it again as CSV.");
  }

  const analysis: Analysis = analyze(table, options);
  const existing = await existingKeys(userId, account.id, analysis.dataset);

  const report: ImportReport = {
    filename,
    dataset: analysis.dataset,
    mode: analysis.mode,
    rowsRead: analysis.rowsRead,
    parsed: analysis.dataset === "trades" ? analysis.trades.length : analysis.events.length,
    fresh: 0,
    duplicates: 0,
    skipped: analysis.skipped,
    openPositions: analysis.openPositions,
    warnings: [...analysis.warnings],
    headers: analysis.headers,
    mappedColumns: analysis.mappedColumns,
    unmappedColumns: analysis.unmappedColumns,
    dayFirst: analysis.dayFirst,
    dateRange: null,
    netPnl: 0,
    preview: [],
    committed: false,
  };

  const ts = nowIso();
  const importId = newId("i_");
  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  const dates: string[] = [];

  if (analysis.dataset === "trades") {
    for (const trade of analysis.trades) {
      const duplicate = existing.has(trade.dedupeKey);
      // The range describes the whole file, so it still reads sensibly when
      // every row turns out to be one you already have.
      dates.push(trade.closeDate);
      if (duplicate) report.duplicates++;
      else {
        report.fresh++;
        report.netPnl += trade.netPnl;
      }

      if (report.preview.length < 25) {
        report.preview.push({
          duplicate,
          date: trade.closeDate,
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          entry: trade.entryPrice,
          exit: trade.exitPrice,
          amount: trade.netPnl,
          detail: trade.closedAt.slice(11, 16),
        });
      }

      if (!duplicate && commit) {
        const riskAmount =
          trade.stopPrice !== null && trade.entryPrice !== null && trade.quantity
            ? Math.abs(trade.entryPrice - trade.stopPrice) * trade.quantity
            : null;
        statements.push({
          sql: `INSERT OR IGNORE INTO trades
                  (id, user_id, account_id, dedupe_key, symbol, side, quantity, entry_price,
                   exit_price, stop_price, opened_at, closed_at, close_date, gross_pnl, fees,
                   net_pnl, risk_amount, r_multiple, tags, notes, source, import_id, raw,
                   created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, 'tradingview', ?, ?, ?, ?)`,
          args: [
            newId("t_"), userId, account.id, trade.dedupeKey, trade.symbol, trade.side,
            trade.quantity, trade.entryPrice, trade.exitPrice, trade.stopPrice,
            trade.openedAt, trade.closedAt, trade.closeDate, trade.grossPnl, trade.fees,
            trade.netPnl, riskAmount && riskAmount > 0 ? riskAmount : null,
            trade.note.slice(0, 2000), importId, JSON.stringify(trade.raw).slice(0, 4000), ts, ts,
          ],
        });
      }
    }
  } else {
    for (const event of analysis.events) {
      const duplicate = existing.has(event.dedupeKey);
      dates.push(event.eventDate);
      if (duplicate) report.duplicates++;
      else {
        report.fresh++;
        // Only rows that actually move cash count towards the reported total;
        // commission and P&L rows are already represented by the trades.
        if (CASH_FLOW_KINDS.has(event.kind)) report.netPnl += event.amount;
      }

      if (report.preview.length < 25) {
        report.preview.push({
          duplicate,
          date: event.eventDate,
          symbol: event.kind,
          side: "",
          quantity: null,
          entry: null,
          exit: event.balance,
          amount: event.amount,
          detail: event.note.slice(0, 60),
        });
      }

      if (!duplicate && commit) {
        statements.push({
          sql: `INSERT OR IGNORE INTO balance_events
                  (id, user_id, account_id, dedupe_key, kind, amount, balance, occurred_at,
                   event_date, note, source, import_id, raw, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tradingview', ?, ?, ?)`,
          args: [
            newId("b_"), userId, account.id, event.dedupeKey, event.kind, event.amount,
            event.balance, event.occurredAt, event.eventDate, event.note.slice(0, 500),
            importId, JSON.stringify(event.raw).slice(0, 4000), ts,
          ],
        });
      }
    }
  }

  if (dates.length) {
    dates.sort();
    report.dateRange = { from: dates[0], to: dates[dates.length - 1] };
  }
  report.netPnl = Math.round(report.netPnl * 100) / 100;

  if (commit) {
    // Chunked so a very large history does not build one enormous transaction.
    for (let i = 0; i < statements.length; i += 400) {
      await batch(statements.slice(i, i + 400));
    }
    await run(
      `INSERT INTO imports (id, user_id, account_id, filename, dataset, format, rows_read,
                            inserted, duplicates, skipped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        importId, userId, account.id, filename.slice(0, 200), analysis.dataset, analysis.mode,
        report.rowsRead, report.fresh, report.duplicates, report.skipped, ts,
      ],
    );
    await run(`UPDATE accounts SET updated_at = ? WHERE id = ? AND user_id = ?`, [ts, account.id, userId]);
    report.committed = true;
  }

  return report;
}

async function existingKeys(userId: string, accountId: string, dataset: Dataset): Promise<Set<string>> {
  const rows = await all<{ dedupe_key: string }>(
    dataset === "trades"
      ? `SELECT dedupe_key FROM trades WHERE user_id = ? AND account_id = ?`
      : `SELECT dedupe_key FROM balance_events WHERE user_id = ? AND account_id = ?`,
    [userId, accountId],
  );
  return new Set(rows.map((r) => r.dedupe_key));
}

/**
 * Re-derives everything that is stored rather than computed, so the whole
 * account is consistent after an import (or a settings change).
 */
export async function refreshAccount(userId: string, accountId: string): Promise<void> {
  await run(
    `UPDATE trades
        SET risk_amount = CASE
              WHEN stop_price IS NOT NULL AND entry_price IS NOT NULL AND quantity > 0
                THEN ABS(entry_price - stop_price) * quantity
              ELSE risk_amount END,
            net_pnl = ROUND(net_pnl, 6),
            close_date = substr(closed_at, 1, 10)
      WHERE user_id = ? AND account_id = ?`,
    [userId, accountId],
  );
  await run(`UPDATE accounts SET updated_at = ? WHERE id = ? AND user_id = ?`, [
    nowIso(),
    accountId,
    userId,
  ]);
}
