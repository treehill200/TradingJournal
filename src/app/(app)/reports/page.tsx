import type { Metadata } from "next";
import { loadJournalView, type SearchParams } from "@/lib/view";
import { byMonth, bySymbol, formatMonthLabel } from "@/lib/metrics";
import { currency, percent } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import FilterBar from "@/components/FilterBar";
import ExportLinks from "@/components/ExportLinks";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { ccy, trades, days, summary, query, symbols, tags } = await loadJournalView(searchParams);
  const months = byMonth(days).reverse();
  const symbolRows = bySymbol(trades);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Period summaries and CSV exports of everything in this account"
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <FilterBar symbols={symbols} tags={tags} />
        <ExportLinks query={query} />

        <section className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Monthly report</h2>
            <p className="text-[11.5px] text-faint">Every month in the current filter, newest first.</p>
          </div>
          {months.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-faint">Nothing to report yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Month", "Net P&L", "Trades", "Win rate", "Green days", "Best day", "Worst day"].map((h) => (
                      <th key={h} className="label px-4 py-2.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => {
                    const monthDays = days.filter((d) => d.date.startsWith(month.key));
                    const green = monthDays.filter((d) => d.netPnl > 0).length;
                    const best = monthDays.reduce((a, b) => (b.netPnl > a.netPnl ? b : a), monthDays[0]);
                    const worst = monthDays.reduce((a, b) => (b.netPnl < a.netPnl ? b : a), monthDays[0]);
                    return (
                      <tr key={month.key} className="border-b border-line-soft last:border-0">
                        <td className="px-4 py-2.5 font-medium">{formatMonthLabel(month.key)}</td>
                        <td className={`num px-4 py-2.5 font-semibold ${month.netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {currency(month.netPnl, ccy, { sign: true })}
                        </td>
                        <td className="num px-4 py-2.5 text-muted">{month.trades}</td>
                        <td className="num px-4 py-2.5 text-muted">{percent(month.winRate, 0)}</td>
                        <td className="num px-4 py-2.5 text-muted">
                          {green}/{monthDays.length}
                        </td>
                        <td className="num px-4 py-2.5 text-profit">
                          {best ? currency(best.netPnl, ccy, { sign: true, compact: true }) : "—"}
                        </td>
                        <td className="num px-4 py-2.5 text-loss">
                          {worst ? currency(worst.netPnl, ccy, { sign: true, compact: true }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Instrument report</h2>
            <p className="text-[11.5px] text-faint">Per-symbol performance across the filtered period.</p>
          </div>
          {symbolRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-faint">No trades in this selection.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Symbol", "Net P&L", "Trades", "Wins", "Losses", "Win rate", "Share of P&L"].map((h) => (
                      <th key={h} className="label px-4 py-2.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {symbolRows.map((s) => (
                    <tr key={s.key} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-2.5 font-medium">{s.label}</td>
                      <td className={`num px-4 py-2.5 font-semibold ${s.netPnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {currency(s.netPnl, ccy, { sign: true })}
                      </td>
                      <td className="num px-4 py-2.5 text-muted">{s.trades}</td>
                      <td className="num px-4 py-2.5 text-muted">{s.wins}</td>
                      <td className="num px-4 py-2.5 text-muted">{s.losses}</td>
                      <td className="num px-4 py-2.5 text-muted">{percent(s.winRate, 0)}</td>
                      <td className="num px-4 py-2.5 text-muted">
                        {summary.netPnl === 0 ? "—" : percent((s.netPnl / Math.abs(summary.netPnl)) * 100, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
