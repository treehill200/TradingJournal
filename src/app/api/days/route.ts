import { all, one } from "@/lib/db";
import { context } from "@/lib/context";
import { fail, guard, json } from "@/lib/api";
import { tradeR } from "@/lib/metrics";
import type { DayEntry, DayNote, Trade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything shown in the day drawer: trades, note and manual entry. */
export async function GET(req: Request) {
  return guard(async () => {
    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!DATE.test(date)) return fail("A date in YYYY-MM-DD format is required.");
    const { user, account } = await context();

    const trades = await all<Trade>(
      `SELECT id, account_id, symbol, side, quantity, entry_price, exit_price, stop_price,
              opened_at, closed_at, close_date, gross_pnl, fees, net_pnl, risk_amount,
              r_multiple, tags, notes, source
         FROM trades
        WHERE user_id = ? AND account_id = ? AND close_date = ?
        ORDER BY closed_at ASC`,
      [user.id, account.id, date],
    );
    const note = await one<DayNote>(
      `SELECT id, account_id, date, title, body, mood, rating, tags, updated_at
         FROM day_notes WHERE user_id = ? AND account_id = ? AND date = ?`,
      [user.id, account.id, date],
    );
    const entry = await one<DayEntry>(
      `SELECT id, account_id, date, net_pnl, trades, wins, losses, r_multiple
         FROM day_entries WHERE user_id = ? AND account_id = ? AND date = ?`,
      [user.id, account.id, date],
    );

    const wins = trades.filter((t) => t.net_pnl > 0).length + (entry?.wins ?? 0);
    const losses = trades.filter((t) => t.net_pnl < 0).length + (entry?.losses ?? 0);
    const netPnl = trades.reduce((s, t) => s + t.net_pnl, 0) + (entry?.net_pnl ?? 0);
    const rValues = trades.map((t) => tradeR(t, account)).filter((r): r is number => r !== null);

    return json({
      date,
      trades,
      note,
      entry,
      totals: {
        netPnl: Math.round(netPnl * 100) / 100,
        fees: Math.round(trades.reduce((s, t) => s + t.fees, 0) * 100) / 100,
        wins,
        losses,
        winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
        rMultiple: rValues.length ? Math.round(rValues.reduce((s, r) => s + r, 0) * 100) / 100 : null,
      },
    });
  });
}
