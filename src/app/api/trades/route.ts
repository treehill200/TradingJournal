import { nowIso, run } from "@/lib/db";
import { newId, sha256 } from "@/lib/ids";
import { context } from "@/lib/context";
import { fail, guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Adds a single trade by hand. */
export async function POST(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const body = await readJson(req);

    const closeDate = str(body.closeDate);
    if (!DATE.test(closeDate)) return fail("A closing date in YYYY-MM-DD format is required.");

    const netPnl = numeric(body.netPnl);
    if (netPnl === null) return fail("Net P&L is required.");

    const symbol = str(body.symbol).trim().toUpperCase().slice(0, 40) || "—";
    const side = str(body.side) === "short" ? "short" : "long";
    const quantity = Math.abs(numeric(body.quantity, 0) ?? 0);
    const entryPrice = numeric(body.entryPrice);
    const exitPrice = numeric(body.exitPrice);
    const stopPrice = numeric(body.stopPrice);
    const fees = Math.abs(numeric(body.fees, 0) ?? 0);
    const time = /^\d{2}:\d{2}$/.test(str(body.closedTime)) ? `${str(body.closedTime)}:00` : "00:00:00";
    const closedAt = `${closeDate}T${time}`;

    const riskAmount =
      stopPrice !== null && entryPrice !== null && quantity
        ? Math.abs(entryPrice - stopPrice) * quantity
        : null;

    const id = newId("t_");
    const ts = nowIso();
    await run(
      `INSERT INTO trades (id, user_id, account_id, dedupe_key, symbol, side, quantity,
                           entry_price, exit_price, stop_price, opened_at, closed_at, close_date,
                           gross_pnl, fees, net_pnl, risk_amount, r_multiple, tags, notes,
                           source, import_id, raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'manual', NULL, '', ?, ?)`,
      [
        id, user.id, account.id, `manual:${sha256(id)}`, symbol, side, quantity,
        entryPrice, exitPrice, stopPrice, null, closedAt, closeDate,
        netPnl + fees, fees, netPnl, riskAmount && riskAmount > 0 ? riskAmount : null,
        str(body.tags).slice(0, 200), str(body.notes).slice(0, 2000), ts, ts,
      ],
    );
    return json({ ok: true, id });
  });
}
