import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { parseFilters } from "@/lib/filters";
import { applyFilters, buildDayRollups, byMonth, filterDayEntries, summarize } from "@/lib/metrics";
import { currency, percent } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import Calendar from "@/components/Calendar";
import FilterBar from "@/components/FilterBar";
import BarChart from "@/components/BarChart";
import AddDayButton from "@/components/AddDayButton";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const filters = parseFilters(await searchParams);
  const { account, trades, dayEntries, notes } = await loadWorkspace(user.id, await activeAccountId());
  const filtered = applyFilters(trades, filters);
  const rollups = buildDayRollups(filtered, account, filterDayEntries(dayEntries, filters), notes);
  const days = [...rollups.values()];
  const summary = summarize(filtered, account, days);
  const months = byMonth(days);

  const symbols = [...new Set(trades.map((t) => t.symbol))].sort();
  const tags = [
    ...new Set(trades.flatMap((t) => t.tags.split(",").map((x) => x.trim()).filter(Boolean))),
  ].sort();

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`${summary.tradingDays} trading day${summary.tradingDays === 1 ? "" : "s"} · ${percent(summary.greenDayRate, 0)} green · ${currency(summary.netPnl, account.currency, { sign: true })} net`}
        actions={<AddDayButton ccy={account.currency} />}
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <FilterBar symbols={symbols} tags={tags} />
        <Calendar days={Object.fromEntries(rollups)} ccy={account.currency} />

        <section className="card p-4">
          <h2 className="text-[14px] font-semibold">Monthly performance</h2>
          <p className="mb-4 text-[11.5px] text-faint">Net realized P&L per calendar month.</p>
          <BarChart
            ccy={account.currency}
            height={220}
            data={months.map((m) => ({
              label: m.label.replace(" 20", " '"),
              value: m.netPnl,
              sub: `${m.trades} trades`,
            }))}
          />
        </section>
      </div>
    </>
  );
}
