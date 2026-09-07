import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { parseFilters } from "@/lib/filters";
import {
  applyFilters, buildDayRollups, buildEquityCurve, byHour, byMonth, bySide, bySymbol,
  byTag, byWeekday, summarize, tradeR,
} from "@/lib/metrics";
import { currency, number, percent, shortDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import FilterBar from "@/components/FilterBar";
import EquityChart from "@/components/EquityChart";
import BarChart from "@/components/BarChart";
import EmptyState from "@/components/EmptyState";
import { IconStats } from "@/components/Icons";

export const metadata: Metadata = { title: "Statistics" };
export const dynamic = "force-dynamic";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const filters = parseFilters(await searchParams);
  const { account, trades, events, dayEntries, notes } = await loadWorkspace(
    user.id,
    await activeAccountId(),
  );
  const ccy = account.currency;
  const filtered = applyFilters(trades, filters);
  const rollups = buildDayRollups(filtered, account, dayEntries, notes);
  const days = [...rollups.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const summary = summarize(filtered, account, days);
  const curve = buildEquityCurve(account, days, events);

  const symbols = [...new Set(trades.map((t) => t.symbol))].sort();
  const tags = [
    ...new Set(trades.flatMap((t) => t.tags.split(",").map((x) => x.trim()).filter(Boolean))),
  ].sort();

  if (!trades.length && !dayEntries.length) {
    return (
      <>
        <PageHeader title="Statistics" subtitle="Nothing to measure yet" />
        <div className="px-4 py-5 sm:px-6">
          <EmptyState
            icon={<IconStats />}
            title="Statistics appear once you have trades"
            body="Import a TradingView export or add a few days by hand, and every metric on this page fills in automatically."
            actionHref="/import"
            actionLabel="Import a CSV"
          />
        </div>
      </>
    );
  }

  const rValues = filtered
    .map((t) => tradeR(t, account))
    .filter((r): r is number => r !== null && Number.isFinite(r));

  const distribution = buildDistribution(filtered.map((t) => t.net_pnl));

  return (
    <>
      <PageHeader
        title="Statistics"
        subtitle={`${summary.trades} trades over ${summary.tradingDays} trading days`}
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <FilterBar symbols={symbols} tags={tags} />

        <section className="card">
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Net P&L" value={currency(summary.netPnl, ccy, { sign: true })} tone={summary.netPnl} />
            <Metric label="Win rate" value={percent(summary.winRate, 1)} />
            <Metric
              label="Profit factor"
              value={summary.profitFactor === null ? "—" : summary.profitFactor === Infinity ? "∞" : summary.profitFactor.toFixed(2)}
              tone={(summary.profitFactor ?? 0) - 1}
            />
            <Metric label="Expectancy" value={summary.expectancy === null ? "—" : currency(summary.expectancy, ccy, { sign: true })} tone={summary.expectancy ?? 0} />
            <Metric label="Total R" value={summary.totalR === null ? "—" : `${summary.totalR > 0 ? "+" : ""}${summary.totalR.toFixed(2)}R`} tone={summary.totalR ?? 0} />
            <Metric label="Average R" value={summary.avgR === null ? "—" : `${summary.avgR > 0 ? "+" : ""}${summary.avgR.toFixed(2)}R`} tone={summary.avgR ?? 0} />

            <Metric label="Average win" value={currency(summary.avgWin, ccy)} />
            <Metric label="Average loss" value={currency(-summary.avgLoss, ccy)} />
            <Metric label="Largest win" value={currency(summary.largestWin, ccy, { sign: true })} tone={1} />
            <Metric label="Largest loss" value={currency(summary.largestLoss, ccy, { sign: true })} tone={-1} />
            <Metric label="Total fees" value={currency(summary.fees, ccy)} />
            <Metric label="Gross P&L" value={currency(summary.grossPnl, ccy, { sign: true })} tone={summary.grossPnl} />

            <Metric label="Trading days" value={String(summary.tradingDays)} />
            <Metric label="Green day rate" value={percent(summary.greenDayRate, 1)} tone={(summary.greenDayRate ?? 0) - 50} />
            <Metric label="Avg day" value={summary.avgDailyPnl === null ? "—" : currency(summary.avgDailyPnl, ccy, { sign: true })} tone={summary.avgDailyPnl ?? 0} />
            <Metric label="Max drawdown" value={currency(-summary.maxDrawdown, ccy)} tone={-1} />
            <Metric label="Best win streak" value={`${summary.maxWinStreak} day${summary.maxWinStreak === 1 ? "" : "s"}`} />
            <Metric label="Worst losing streak" value={`${summary.maxLossStreak} day${summary.maxLossStreak === 1 ? "" : "s"}`} />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[14px] font-semibold">Equity curve</h2>
          <p className="mb-3 text-[11.5px] text-faint">
            Starting balance {currency(account.starting_balance, ccy)} · realized P&L and cash flows only.
          </p>
          <EquityChart points={curve} ccy={ccy} height={300} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">Drawdown from peak</h2>
            <p className="mb-3 text-[11.5px] text-faint">
              How far below the account&apos;s high-water mark you were on each day.
            </p>
            <EquityChart points={curve} ccy={ccy} height={240} mode="drawdown" />
          </section>

          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">Daily P&L</h2>
            <p className="mb-3 text-[11.5px] text-faint">The last {Math.min(days.length, 60)} trading days.</p>
            <BarChart
              ccy={ccy}
              height={240}
              data={days.slice(-60).map((d) => ({
                label: shortDate(d.date).replace(/, \d{4}$/, ""),
                value: d.netPnl,
                sub: `${d.trades} trades`,
              }))}
            />
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Breakdown title="By symbol" subtitle="Where the money actually comes from" data={bySymbol(filtered)} ccy={ccy} />
          <Breakdown title="By weekday" subtitle="Closing day of the week" data={byWeekday(filtered)} ccy={ccy} />
          <Breakdown title="By hour closed" subtitle="Hour of day the trade was closed" data={byHour(filtered)} ccy={ccy} />
          <Breakdown title="Long vs short" subtitle="Direction bias" data={bySide(filtered)} ccy={ccy} />
          {tags.length > 0 && (
            <Breakdown title="By tag" subtitle="Your own labels" data={byTag(filtered)} ccy={ccy} />
          )}
          <Breakdown title="By month" subtitle="Calendar month totals" data={byMonth(days)} ccy={ccy} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">Trade P&L distribution</h2>
            <p className="mb-4 text-[11.5px] text-faint">
              Number of trades in each P&amp;L bucket ({ccy}).
            </p>
            <BarChart ccy={ccy} height={220} data={distribution} valueFormat="count" />
          </section>

          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">R multiple spread</h2>
            <p className="mb-4 text-[11.5px] text-faint">
              {rValues.length
                ? `${rValues.length} trades with a known risk. Set risk per trade in Settings to include the rest.`
                : "Set a risk per trade in Settings, or add stop prices, to see R multiples."}
            </p>
            {rValues.length > 0 ? (
              <dl className="grid grid-cols-2 gap-3">
                <RStat label="Total R" value={`${sum(rValues) > 0 ? "+" : ""}${sum(rValues).toFixed(2)}R`} />
                <RStat label="Average R" value={`${avg(rValues) > 0 ? "+" : ""}${avg(rValues).toFixed(2)}R`} />
                <RStat label="Best R" value={`+${Math.max(...rValues).toFixed(2)}R`} />
                <RStat label="Worst R" value={`${Math.min(...rValues).toFixed(2)}R`} />
                <RStat label="Winners ≥ 1R" value={String(rValues.filter((r) => r >= 1).length)} />
                <RStat label="Losers ≤ -1R" value={String(rValues.filter((r) => r <= -1).length)} />
              </dl>
            ) : (
              <p className="py-6 text-center text-[13px] text-faint">No R data yet.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}
function avg(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function buildDistribution(values: number[]): { label: string; value: number; sub: string }[] {
  if (!values.length) return [];
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const step = niceStep(maxAbs / 5);
  const buckets = new Map<number, number>();
  for (const v of values) {
    const bucket = Math.floor(v / step);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({
      label: `${bucket * step >= 0 ? "+" : ""}${Math.round(bucket * step)}`,
      // Height carries the count; sign keeps losing buckets red.
      value: bucket < 0 ? -count : count,
      sub: `${count} trade${count === 1 ? "" : "s"}`,
    }));
}

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function Metric({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="label">{label}</div>
      <div
        className={`num mt-1.5 text-[17px] font-semibold ${
          tone > 0 ? "text-profit" : tone < 0 ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

function Breakdown({
  title,
  subtitle,
  data,
  ccy,
}: {
  title: string;
  subtitle: string;
  data: { label: string; netPnl: number; trades: number; winRate: number | null }[];
  ccy: string;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <p className="mb-4 text-[11.5px] text-faint">{subtitle}</p>
      {data.length ? (
        <>
          <BarChart
            horizontal
            ccy={ccy}
            data={data.slice(0, 12).map((b) => ({
              label: b.label,
              value: b.netPnl,
              sub: `${b.trades}t · ${percent(b.winRate, 0)}`,
            }))}
          />
          {data.length > 12 && (
            <p className="mt-3 text-[11.5px] text-faint">Showing the top 12 of {number(data.length, 0)}.</p>
          )}
        </>
      ) : (
        <p className="py-6 text-center text-[13px] text-faint">No data for this selection.</p>
      )}
    </section>
  );
}
