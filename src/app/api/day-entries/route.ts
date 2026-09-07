import { nowIso, one, run } from "@/lib/db";
import { newId } from "@/lib/ids";
import { context } from "@/lib/context";
import { fail, guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Manual "totals for the day" entries, for back-filling without every trade. */
export async function POST(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const body = await readJson(req);
    const date = str(body.date);
    if (!DATE.test(date)) return fail("A date in YYYY-MM-DD format is required.");

    const netPnl = numeric(body.netPnl);
    if (netPnl === null) return fail("Net P&L is required.");

    const trades = Math.max(0, Math.round(numeric(body.trades, 0) ?? 0));
    const wins = Math.max(0, Math.round(numeric(body.wins, 0) ?? 0));
    const losses = Math.max(0, Math.round(numeric(body.losses, 0) ?? 0));
    const rMultiple = numeric(body.rMultiple);

    const existing = await one<{ id: string }>(
      `SELECT id FROM day_entries WHERE user_id = ? AND account_id = ? AND date = ?`,
      [user.id, account.id, date],
    );

    if (existing) {
      await run(
        `UPDATE day_entries SET net_pnl = ?, trades = ?, wins = ?, losses = ?, r_multiple = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [netPnl, trades, wins, losses, rMultiple, nowIso(), existing.id, user.id],
      );
    } else {
      const ts = nowIso();
      await run(
        `INSERT INTO day_entries (id, user_id, account_id, date, net_pnl, trades, wins, losses, r_multiple, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId("d_"), user.id, account.id, date, netPnl, trades, wins, losses, rMultiple, ts, ts],
      );
    }
    return json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!DATE.test(date)) return fail("A date in YYYY-MM-DD format is required.");
    await run(`DELETE FROM day_entries WHERE user_id = ? AND account_id = ? AND date = ?`, [
      user.id,
      account.id,
      date,
    ]);
    return json({ ok: true });
  });
}
