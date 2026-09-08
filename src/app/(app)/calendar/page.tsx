import type { Metadata } from "next";
import { loadJournalView, type SearchParams } from "@/lib/view";
import { byMonth } from "@/lib/metrics";
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
  searchParams: Promise<SearchParams>;
}) {
  const { ccy, days, dayMap, summary, symbols, tags } = await loadJournalView(searchParams);
  const months = byMonth(days);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={`${summary.tradingDays} trading day${summary.tradingDays === 1 ? "" : "s"} · ${percent(summary.greenDayRate, 0)} green · ${currency(summary.netPnl, ccy, { sign: true })} net`}
        actions={<AddDayButton ccy={ccy} />}
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <FilterBar symbols={symbols} tags={tags} />
        <Calendar days={dayMap} ccy={ccy} />

        <section className="card p-4">
          <h2 className="text-[14px] font-semibold">Monthly performance</h2>
          <p className="mb-4 text-[11.5px] text-faint">Net realized P&L per calendar month.</p>
          <BarChart
            ccy={ccy}
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
