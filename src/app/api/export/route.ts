import { context } from "@/lib/context";
import { fail, guard } from "@/lib/api";
import { listBalanceEvents, listDayEntries, listNotes, listTrades } from "@/lib/store";
import { parseFilters } from "@/lib/filters";
import { applyFilters, buildDayRollups, tradeR } from "@/lib/metrics";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV exports of whatever the current filters select. */
export async function GET(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "trades";

    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    const filters = parseFilters(params);

    const [trades, dayEntries, notes, events] = await Promise.all([
      listTrades(user.id, account.id),
      listDayEntries(user.id, account.id),
      listNotes(user.id, account.id),
      listBalanceEvents(user.id, account.id),
    ]);
    const filtered = applyFilters(trades, filters);

    let csv: string;
    let name: string;

    if (type === "trades") {
      csv = toCsv(
        ["close_date", "closed_at", "opened_at", "symbol", "side", "quantity", "entry_price",
         "exit_price", "stop_price", "gross_pnl", "fees", "net_pnl", "r_multiple", "tags", "notes", "source"],
        filtered.map((t) => [
          t.close_date, t.closed_at, t.opened_at, t.symbol, t.side, t.quantity, t.entry_price,
          t.exit_price, t.stop_price, t.gross_pnl, t.fees, t.net_pnl,
          tradeR(t, account)?.toFixed(4) ?? "", t.tags, t.notes, t.source,
        ]),
      );
      name = "trades";
    } else if (type === "days") {
      const rollups = [...buildDayRollups(filtered, account, dayEntries, notes).values()].sort((a, b) =>
        a.date < b.date ? -1 : 1,
      );
      csv = toCsv(
        ["date", "net_pnl", "gross_pnl", "fees", "trades", "wins", "losses", "win_rate", "r_multiple", "symbols"],
        rollups.map((d) => [
          d.date, d.netPnl, d.grossPnl, d.fees, d.trades, d.wins, d.losses,
          d.winRate === null ? "" : d.winRate.toFixed(2),
          d.rMultiple === null ? "" : d.rMultiple.toFixed(2),
          d.symbols.join(" "),
        ]),
      );
      name = "daily-summary";
    } else if (type === "notes") {
      csv = toCsv(
        ["date", "title", "mood", "rating", "tags", "body"],
        notes
          .slice()
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((n) => [n.date, n.title, n.mood, n.rating, n.tags, n.body]),
      );
      name = "journal";
    } else if (type === "balance") {
      csv = toCsv(
        ["event_date", "occurred_at", "kind", "amount", "balance", "note", "source"],
        events.map((e) => [e.event_date, e.occurred_at, e.kind, e.amount, e.balance, e.note, e.source]),
      );
      name = "balance-history";
    } else {
      return fail("Unknown export type.");
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${slug(account.name)}-${name}-${stamp}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
}
