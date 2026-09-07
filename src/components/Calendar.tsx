"use client";

import { useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconPencil } from "@/components/Icons";
import DayPanel from "@/components/DayPanel";
import type { DayRollup } from "@/lib/metrics";
import { addDays, monthGrid, startOfWeek, todayKey, weekdayIndex } from "@/lib/metrics";
import { currency, monthTitle, percent } from "@/lib/format";

export type Metric = "pnl" | "r" | "trades" | "winrate";
type View = "month" | "week" | "list";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const METRIC_LABELS: Record<Metric, string> = {
  pnl: "Net P&L",
  r: "R multiple",
  trades: "Trade count",
  winrate: "Win rate",
};

export default function Calendar({
  days,
  ccy,
  initialDate,
  compact = false,
}: {
  days: Record<string, DayRollup>;
  ccy: string;
  initialDate?: string;
  compact?: boolean;
}) {
  const today = todayKey();
  const [cursor, setCursor] = useState(initialDate ?? today); // any day inside the shown period
  const [view, setView] = useState<View>("month");
  const [metric, setMetric] = useState<Metric>("pnl");
  const [selected, setSelected] = useState<string | null>(null);

  const [year, month] = [Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7))];
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const monthPrefix = cursor.slice(0, 7);

  const monthDays = useMemo(
    () => Object.values(days).filter((d) => d.date.startsWith(monthPrefix)),
    [days, monthPrefix],
  );

  // Heat scale is per-month so a single outlier day cannot wash out the rest.
  const maxAbs = useMemo(() => {
    const values = monthDays.map((d) => Math.abs(d.netPnl)).filter((v) => v > 0);
    return values.length ? Math.max(...values) : 0;
  }, [monthDays]);

  const monthTotal = monthDays.reduce((s, d) => s + d.netPnl, 0);
  const monthTrades = monthDays.reduce((s, d) => s + d.trades, 0);
  const greenDays = monthDays.filter((d) => d.netPnl > 0).length;

  function shift(direction: number) {
    if (view === "week") {
      setCursor(addDays(cursor, direction * 7));
      return;
    }
    const next = new Date(Date.UTC(year, month - 1 + direction, 1));
    setCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const listDays = useMemo(
    () => Object.values(days).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [days],
  );

  return (
    <div className="card overflow-hidden">
      {/* toolbar ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={() => shift(-1)} aria-label="Previous">
            <IconChevronLeft width={17} height={17} />
          </button>
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={() => shift(1)} aria-label="Next">
            <IconChevronRight width={17} height={17} />
          </button>
          <button className="btn h-9" onClick={() => setCursor(today)}>
            Today
          </button>
        </div>

        <div className="min-w-0">
          <div className="text-[16px] font-semibold tracking-tight">
            {view === "week"
              ? `Week of ${weekStart}`
              : view === "list"
                ? "All trading days"
                : monthTitle(year, month)}
          </div>
          {view !== "list" && (
            <div className="mt-0.5 text-[11.5px] text-faint">
              <span className={monthTotal > 0 ? "text-profit" : monthTotal < 0 ? "text-loss" : ""}>
                {currency(monthTotal, ccy, { sign: true })}
              </span>
              {" · "}
              {monthDays.length} day{monthDays.length === 1 ? "" : "s"} · {monthTrades} trades
              {monthDays.length > 0 && ` · ${Math.round((greenDays / monthDays.length) * 100)}% green`}
            </div>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="input h-9 w-auto min-w-[132px] text-[12.5px]"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            aria-label="Calendar metric"
          >
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
          <div className="segment">
            {(["month", "week", "list"] as View[]).map((v) => (
              <button key={v} data-active={view === v} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* body --------------------------------------------------------- */}
      {view === "month" && (
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_112px] border-b border-line-soft">
              {DOW.map((d) => (
                <div key={d} className="label px-3 py-2.5 text-center">
                  {d}
                </div>
              ))}
              <div className="label border-l border-line-soft px-3 py-2.5 text-center">Week</div>
            </div>

            {Array.from({ length: 6 }, (_, week) => {
              const cells = grid.slice(week * 7, week * 7 + 7);
              const weekTotal = cells.reduce((s, key) => s + (days[key]?.netPnl ?? 0), 0);
              const weekTrades = cells.reduce((s, key) => s + (days[key]?.trades ?? 0), 0);
              const active = cells.filter((key) => days[key]);
              if (week === 5 && !cells.some((key) => key.startsWith(monthPrefix))) return null;

              return (
                <div
                  key={week}
                  className="grid grid-cols-[repeat(7,minmax(0,1fr))_112px] border-b border-line-soft last:border-b-0"
                >
                  {cells.map((key) => (
                    <DayCell
                      key={key}
                      dateKey={key}
                      day={days[key]}
                      inMonth={key.startsWith(monthPrefix)}
                      isToday={key === today}
                      metric={metric}
                      maxAbs={maxAbs}
                      ccy={ccy}
                      compact={compact}
                      onSelect={setSelected}
                    />
                  ))}
                  <div className="flex flex-col justify-center border-l border-line-soft bg-surface-2/40 px-3 py-2">
                    <div className="label text-[10px]">Week {week + 1}</div>
                    <div
                      className={`num mt-1 text-[13px] font-semibold ${
                        weekTotal > 0 ? "text-profit" : weekTotal < 0 ? "text-loss" : "text-faint"
                      }`}
                    >
                      {active.length ? currency(weekTotal, ccy, { sign: true, compact: true }) : "—"}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-faint">
                      {active.length ? `${active.length}d · ${weekTrades}t` : "no trades"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekDays.map((key) => {
            const day = days[key];
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className="card card-hover min-h-[128px] p-3 text-left"
                style={{ background: day ? heatBackground(day.netPnl, maxAbs) : undefined }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-faint">{DOW[weekdayIndex(key)]}</span>
                  <span
                    className={`num text-[12px] ${key === todayKey() ? "rounded-md bg-brand px-1.5 py-0.5 text-canvas" : "text-muted"}`}
                  >
                    {Number(key.slice(8))}
                  </span>
                </div>
                {day ? (
                  <>
                    <div
                      className={`num mt-4 text-[17px] font-semibold ${day.netPnl >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {currency(day.netPnl, ccy, { sign: true })}
                    </div>
                    <div className="mt-1 text-[11px] text-faint">
                      {day.trades} trades · {percent(day.winRate, 0)} win
                    </div>
                    {day.rMultiple !== null && (
                      <div className="mt-0.5 text-[11px] text-faint">
                        {day.rMultiple > 0 ? "+" : ""}
                        {day.rMultiple.toFixed(2)}R
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-6 text-[12px] text-faint">No trades</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div className="overflow-x-auto">
          {listDays.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-faint">
              No trading days yet. Import a CSV or add a day manually.
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  {["Date", "Net P&L", "Trades", "Win rate", "R", "Symbols", ""].map((h) => (
                    <th key={h} className="label px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listDays.map((day) => (
                  <tr
                    key={day.date}
                    onClick={() => setSelected(day.date)}
                    className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="num px-4 py-2.5 whitespace-nowrap">{day.date}</td>
                    <td
                      className={`num px-4 py-2.5 font-semibold ${day.netPnl >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {currency(day.netPnl, ccy, { sign: true })}
                    </td>
                    <td className="num px-4 py-2.5 text-muted">{day.trades}</td>
                    <td className="num px-4 py-2.5 text-muted">{percent(day.winRate, 0)}</td>
                    <td className="num px-4 py-2.5 text-muted">
                      {day.rMultiple === null ? "—" : `${day.rMultiple > 0 ? "+" : ""}${day.rMultiple.toFixed(2)}R`}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 text-muted">
                      {day.symbols.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-faint">{day.hasNote && <IconPencil width={14} height={14} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && <DayPanel date={selected} ccy={ccy} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function heatBackground(pnl: number, maxAbs: number): string {
  if (!pnl || !maxAbs) return "transparent";
  const intensity = Math.min(1, Math.abs(pnl) / maxAbs) ** 0.55;
  const alpha = 0.05 + intensity * 0.24;
  return pnl > 0 ? `rgba(52, 211, 153, ${alpha.toFixed(3)})` : `rgba(251, 113, 133, ${alpha.toFixed(3)})`;
}

function DayCell({
  dateKey,
  day,
  inMonth,
  isToday,
  metric,
  maxAbs,
  ccy,
  compact,
  onSelect,
}: {
  dateKey: string;
  day?: DayRollup;
  inMonth: boolean;
  isToday: boolean;
  metric: Metric;
  maxAbs: number;
  ccy: string;
  compact: boolean;
  onSelect: (date: string) => void;
}) {
  const dayNumber = Number(dateKey.slice(8));
  const value = day
    ? metric === "pnl"
      ? currency(day.netPnl, ccy, { sign: true, compact: true })
      : metric === "r"
        ? day.rMultiple === null
          ? "—"
          : `${day.rMultiple > 0 ? "+" : ""}${day.rMultiple.toFixed(2)}R`
        : metric === "trades"
          ? String(day.trades)
          : percent(day.winRate, 0)
    : null;

  const signSource = metric === "r" ? (day?.rMultiple ?? 0) : (day?.netPnl ?? 0);
  const valueTone =
    metric === "trades" || metric === "winrate"
      ? "text-ink"
      : signSource > 0
        ? "text-profit"
        : signSource < 0
          ? "text-loss"
          : "text-muted";

  return (
    <button
      onClick={() => onSelect(dateKey)}
      className={`group relative border-r border-line-soft px-2.5 text-left transition-colors last:border-r-0 hover:bg-surface-2/70 ${
        compact ? "py-2" : "py-2.5"
      } ${inMonth ? "" : "opacity-40"}`}
      style={{ background: day ? heatBackground(day.netPnl, maxAbs) : undefined, minHeight: compact ? 84 : 104 }}
    >
      <div className="flex items-center justify-between">
        <span
          className={`num text-[12px] ${
            isToday
              ? "grid h-[22px] min-w-[22px] place-items-center rounded-md bg-brand px-1 font-semibold text-canvas"
              : inMonth
                ? "text-muted"
                : "text-faint"
          }`}
        >
          {dayNumber}
        </span>
        {day?.hasNote && <span className="h-1.5 w-1.5 rounded-full bg-brand" title="Journal note" />}
      </div>

      {day ? (
        <div className="mt-2.5">
          <div className={`num text-[14px] font-semibold leading-tight ${valueTone}`}>{value}</div>
          <div className="mt-1 text-[10.5px] leading-tight text-faint">
            {day.trades} trade{day.trades === 1 ? "" : "s"}
            {day.winRate !== null && ` · ${Math.round(day.winRate)}% win`}
          </div>
          {!compact && day.rMultiple !== null && metric !== "r" && (
            <div className="mt-0.5 text-[10.5px] text-faint">
              {day.rMultiple > 0 ? "+" : ""}
              {day.rMultiple.toFixed(2)}R
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 text-[10.5px] text-transparent transition-colors group-hover:text-faint">
          + add day
        </div>
      )}
    </button>
  );
}
