import Link from "next/link";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { parseFilters } from "@/lib/filters";
import {
  accountBalance, applyFilters, buildDayRollups, buildEquityCurve, bySymbol,
  addDays, filterDayEntries, monthKey, startOfWeek, summarize, todayKey,
} from "@/lib/metrics";
import { currency, percent, shortDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import Calendar from "@/components/Calendar";
import FilterBar from "@/components/FilterBar";
import EquityChart from "@/components/EquityChart";
import BarChart from "@/components/BarChart";
import AddDayButton from "@/components/AddDayButton";
import EmptyState from "@/components/EmptyState";
import {
  IconCalendar, IconGauge, IconPulse, IconTarget, IconTrend, IconUpload, IconWallet,
} from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { account, trades, events, dayEntries, notes } = await loadWorkspace(
    user.id,
    await activeAccountId(),
  );

  const filtered = applyFilters(trades, filters);
  const filteredEntries = filterDayEntries(dayEntries, filters);
  const rollups = buildDayRollups(filtered, account, filteredEntries, notes);
  const days = [...rollups.values()].filter((d) => d.activity).sort((a, b) => (a.date < b.date ? -1 : 1));
  const summary = summarize(filtered, account, days);
  const curve = buildEquityCurve(account, days, events);
  const balance = accountBalance(account, trades, dayEntries, events);
  const ccy = account.currency;

  const today = todayKey();
  const weekStart = startOfWeek(today);
  const thisMonth = monthKey(today);

  const todayDay = rollups.get(today);
  const weekDays = days.filter((d) => d.date >= weekStart && d.date <= addDays(weekStart, 6));
  const monthDays = days.filter((d) => d.date.startsWith(thisMonth));
  const weekPnl = weekDays.reduce((s, d) => s + d.netPnl, 0);
  const monthPnl = monthDays.reduce((s, d) => s + d.netPnl, 0);
  const monthR = monthDays.reduce((s, d) => s + (d.rMultiple ?? 0), 0);

  const dayMap = Object.fromEntries(rollups);
  const allSymbols = [...new Set(trades.map((t) => t.symbol))].sort();
  const allTags = [
    ...new Set(trades.flatMap((t) => t.tags.split(",").map((x) => x.trim()).filter(Boolean))),
  ].sort();

  const isEmpty = trades.length === 0 && dayEntries.length === 0;
  const last30 = days.slice(-30);
  const cumulative: number[] = [];
  last30.reduce((acc, d) => {
    const next = acc + d.netPnl;
    cumulative.push(next);
    return next;
  }, 0);

  // Best first, then the worst performers that are not already listed.
  const symbolBuckets = bySymbol(filtered);
  const topSymbols = symbolBuckets.slice(0, 8);
  const topKeys = new Set(topSymbols.map((b) => b.key));
  const worstSymbols = symbolBuckets
    .slice(-5)
    .reverse()
    .filter((b) => !topKeys.has(b.key));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          isEmpty
            ? "Realized P&L · nothing imported yet"
            : `Realized P&L · ${summary.tradingDays} trading day${summary.tradingDays === 1 ? "" : "s"} · ${summary.trades} trades`
        }
        actions={
          <>
            <AddDayButton ccy={ccy} />
            <Link href="/import" className="btn btn-primary">
              <IconUpload width={15} height={15} /> Import CSV
            </Link>
          </>
        }
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        {isEmpty ? (
          <EmptyState
            icon={<IconUpload />}
            title="Your journal is empty — exactly as it should start"
            body="Import a TradingView Trade History export to fill the calendar, or add a day by hand. Nothing is pre-populated, and repeat imports never duplicate a trade."
            actionHref="/import"
            actionLabel="Import TradingView CSV"
            secondary={<AddDayButton ccy={ccy} />}
          />
        ) : null}

        {/* KPI row -------------------------------------------------- */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Today P&L"
            value={currency(todayDay?.netPnl ?? 0, ccy, { sign: true })}
            tone={(todayDay?.netPnl ?? 0) > 0 ? "profit" : (todayDay?.netPnl ?? 0) < 0 ? "loss" : "neutral"}
            icon={<IconTrend width={16} height={16} />}
            sub={
              todayDay
                ? `${todayDay.trades} trades · ${percent(todayDay.winRate, 0)} win`
                : "No trades closed today"
            }
          />
          <StatCard
            label="This week"
            value={currency(weekPnl, ccy, { sign: true })}
            tone={weekPnl > 0 ? "profit" : weekPnl < 0 ? "loss" : "neutral"}
            icon={<IconPulse width={16} height={16} />}
            sub={`${weekDays.length} trading day${weekDays.length === 1 ? "" : "s"}`}
          />
          <StatCard
            label="This month"
            value={currency(monthPnl, ccy, { sign: true })}
            tone={monthPnl > 0 ? "profit" : monthPnl < 0 ? "loss" : "neutral"}
            icon={<IconCalendar width={16} height={16} />}
            sub={`${monthDays.filter((d) => d.netPnl > 0).length} green · ${monthDays.filter((d) => d.netPnl < 0).length} red`}
          />
          <StatCard
            label="Account balance"
            value={currency(balance, ccy)}
            icon={<IconWallet width={16} height={16} />}
            spark={curve.length > 2 ? curve.slice(-40).map((p) => p.balance) : undefined}
            sub={
              account.starting_balance > 0
                ? `${percent(((balance - account.starting_balance) / account.starting_balance) * 100, 2)} total return`
                : "Add a starting balance in Settings"
            }
          />
          <StatCard
            label="Green day rate"
            value={percent(summary.greenDayRate, 1)}
            tone={(summary.greenDayRate ?? 0) >= 50 ? "profit" : "loss"}
            icon={<IconGauge width={16} height={16} />}
            sub={`${summary.greenDays} green / ${summary.redDays} red`}
          />
          <StatCard
            label="Average daily R"
            value={summary.avgDailyR === null ? "—" : `${summary.avgDailyR > 0 ? "+" : ""}${summary.avgDailyR.toFixed(2)}R`}
            tone={(summary.avgDailyR ?? 0) > 0 ? "profit" : (summary.avgDailyR ?? 0) < 0 ? "loss" : "neutral"}
            icon={<IconTarget width={16} height={16} />}
            spark={cumulative.length > 2 ? cumulative : undefined}
            sub={
              summary.totalR === null
                ? "Set risk per trade in Settings"
                : `${summary.totalR > 0 ? "+" : ""}${summary.totalR.toFixed(2)}R total · ${monthR.toFixed(2)}R this month`
            }
          />
        </div>

        <FilterBar symbols={allSymbols} tags={allTags} />

        <Calendar days={dayMap} ccy={ccy} />

        {/* lower grid ----------------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="card p-4 xl:col-span-2">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-semibold">Equity curve</h2>
              <Link href="/statistics" className="link text-[12px]">
                Full statistics →
              </Link>
            </div>
            <p className="mb-3 text-[11.5px] text-faint">
              Starting balance {currency(account.starting_balance, ccy)} plus realized P&L and cash flows.
            </p>
            <EquityChart points={curve} ccy={ccy} height={280} />
          </section>

          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">P&L by symbol</h2>
            <p className="mb-4 text-[11.5px] text-faint">Best and worst instruments in the current filter.</p>
            {topSymbols.length ? (
              <BarChart
                horizontal
                ccy={ccy}
                data={[...topSymbols, ...worstSymbols].map((b) => ({
                  label: b.label,
                  value: b.netPnl,
                  sub: `${b.trades}t · ${percent(b.winRate, 0)}`,
                }))}
              />
            ) : (
              <p className="py-8 text-center text-[13px] text-faint">No trades match the filter.</p>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <MiniStat label="Profit factor" value={summary.profitFactor === null ? "—" : summary.profitFactor === Infinity ? "∞" : summary.profitFactor.toFixed(2)} hint="gross wins ÷ gross losses" />
          <MiniStat label="Expectancy per trade" value={summary.expectancy === null ? "—" : currency(summary.expectancy, ccy, { sign: true })} hint={`${summary.wins}W / ${summary.losses}L`} />
          <MiniStat
            label="Max drawdown"
            value={currency(-summary.maxDrawdown, ccy)}
            hint={summary.maxDrawdownPct === null ? "on realized equity" : `${summary.maxDrawdownPct.toFixed(2)}% from peak`}
          />
        </div>

        {summary.bestDay && summary.worstDay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <HighlightDay title="Best day" day={summary.bestDay} ccy={ccy} tone="profit" />
            <HighlightDay title="Worst day" day={summary.worstDay} ccy={ccy} tone="loss" />
          </div>
        )}
      </div>
    </>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card flex items-baseline justify-between gap-3 p-4">
      <div>
        <div className="label">{label}</div>
        <div className="mt-1 text-[11.5px] text-faint">{hint}</div>
      </div>
      <div className="num text-[20px] font-semibold">{value}</div>
    </div>
  );
}

function HighlightDay({
  title,
  day,
  ccy,
  tone,
}: {
  title: string;
  day: { date: string; netPnl: number; trades: number; winRate: number | null };
  ccy: string;
  tone: "profit" | "loss";
}) {
  return (
    <div className="card p-4">
      <div className="label">{title}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className={`num text-[22px] font-semibold ${tone === "profit" ? "text-profit" : "text-loss"}`}>
            {currency(day.netPnl, ccy, { sign: true })}
          </div>
          <div className="mt-1 text-[12px] text-faint">
            {shortDate(day.date)} · {day.trades} trades · {percent(day.winRate, 0)} win
          </div>
        </div>
      </div>
    </div>
  );
}
