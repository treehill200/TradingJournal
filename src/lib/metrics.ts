import { CASH_FLOW_KINDS } from "./constants";
import type { Account, BalanceEvent, DayEntry, DayNote, Filters, Trade } from "./types";

/* ------------------------------------------------------------------ */
/* dates (all plain YYYY-MM-DD strings, never Date-with-timezone)       */
/* ------------------------------------------------------------------ */

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Parses YYYY-MM-DD into a UTC Date, so day maths never shifts a day. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}

export function monthKey(key: string): string {
  return key.slice(0, 7);
}

/** Monday-based weekday index, 0 = Monday. */
export function weekdayIndex(key: string): number {
  return (parseKey(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function monthGrid(year: number, month: number): string[] {
  // 6 rows × 7 days covering the whole month, Monday first.
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard++ < 4000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* risk / R multiples                                                  */
/* ------------------------------------------------------------------ */

/** Dollar value of 1R for an account, used when a trade has no own risk. */
export function accountRiskPerR(account: Account): number {
  if (account.risk_mode === "percent") {
    return (account.starting_balance * account.risk_value) / 100;
  }
  return account.risk_value;
}

/**
 * R for a trade, most specific source first:
 *   1. an R stored on the trade
 *   2. its own risk amount
 *   3. entry-to-stop distance × size
 *   4. the account's configured risk per trade
 */
export function tradeR(trade: Trade, account: Account): number | null {
  if (trade.r_multiple !== null && trade.r_multiple !== undefined) return trade.r_multiple;
  if (trade.risk_amount && trade.risk_amount > 0) return trade.net_pnl / trade.risk_amount;
  if (trade.stop_price !== null && trade.entry_price !== null && trade.quantity) {
    const risk = Math.abs(trade.entry_price - trade.stop_price) * trade.quantity;
    if (risk > 0) return trade.net_pnl / risk;
  }
  const perR = accountRiskPerR(account);
  return perR > 0 ? trade.net_pnl / perR : null;
}

/* ------------------------------------------------------------------ */
/* filtering                                                           */
/* ------------------------------------------------------------------ */

export function applyFilters(trades: Trade[], filters: Filters): Trade[] {
  const symbols = new Set(filters.symbols.map((s) => s.toUpperCase()));
  const sides = new Set(filters.sides);
  const tags = filters.tags.map((t) => t.toLowerCase());
  const search = filters.search?.trim().toLowerCase();

  return trades.filter((t) => {
    if (filters.from && t.close_date < filters.from) return false;
    if (filters.to && t.close_date > filters.to) return false;
    if (symbols.size && !symbols.has(t.symbol.toUpperCase())) return false;
    if (sides.size && !sides.has(t.side)) return false;
    if (filters.result === "wins" && t.net_pnl <= 0) return false;
    if (filters.result === "losses" && t.net_pnl >= 0) return false;
    if (tags.length) {
      const own = t.tags.toLowerCase();
      if (!tags.some((tag) => own.includes(tag))) return false;
    }
    if (search) {
      const haystack = `${t.symbol} ${t.tags} ${t.notes}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* day rollups                                                         */
/* ------------------------------------------------------------------ */

export type DayRollup = {
  date: string;
  netPnl: number;
  grossPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  rMultiple: number | null;
  volume: number;
  symbols: string[];
  manual: boolean;
  hasNote: boolean;
};

export function buildDayRollups(
  trades: Trade[],
  account: Account,
  dayEntries: DayEntry[] = [],
  notes: DayNote[] = [],
): Map<string, DayRollup> {
  const map = new Map<string, DayRollup>();

  const ensure = (date: string): DayRollup => {
    let day = map.get(date);
    if (!day) {
      day = {
        date, netPnl: 0, grossPnl: 0, fees: 0, trades: 0, wins: 0, losses: 0,
        breakeven: 0, winRate: null, rMultiple: null, volume: 0, symbols: [],
        manual: false, hasNote: false,
      };
      map.set(date, day);
    }
    return day;
  };

  const symbolSets = new Map<string, Set<string>>();
  const rTotals = new Map<string, { sum: number; count: number }>();

  for (const trade of trades) {
    const day = ensure(trade.close_date);
    day.netPnl += trade.net_pnl;
    day.grossPnl += trade.gross_pnl;
    day.fees += trade.fees;
    day.trades += 1;
    day.volume += Math.abs(trade.quantity);
    if (trade.net_pnl > 0) day.wins += 1;
    else if (trade.net_pnl < 0) day.losses += 1;
    else day.breakeven += 1;

    const set = symbolSets.get(trade.close_date) ?? new Set<string>();
    set.add(trade.symbol);
    symbolSets.set(trade.close_date, set);

    const r = tradeR(trade, account);
    if (r !== null && Number.isFinite(r)) {
      const acc = rTotals.get(trade.close_date) ?? { sum: 0, count: 0 };
      acc.sum += r;
      acc.count += 1;
      rTotals.set(trade.close_date, acc);
    }
  }

  for (const entry of dayEntries) {
    const day = ensure(entry.date);
    day.manual = true;
    day.netPnl += entry.net_pnl;
    day.grossPnl += entry.net_pnl;
    day.trades += entry.trades;
    day.wins += entry.wins;
    day.losses += entry.losses;
    if (entry.r_multiple !== null && entry.r_multiple !== undefined) {
      const acc = rTotals.get(entry.date) ?? { sum: 0, count: 0 };
      acc.sum += entry.r_multiple;
      acc.count += 1;
      rTotals.set(entry.date, acc);
    } else {
      const perR = accountRiskPerR(account);
      if (perR > 0) {
        const acc = rTotals.get(entry.date) ?? { sum: 0, count: 0 };
        acc.sum += entry.net_pnl / perR;
        acc.count += 1;
        rTotals.set(entry.date, acc);
      }
    }
  }

  for (const note of notes) {
    if (note.body.trim() || note.title.trim() || note.rating !== null) ensure(note.date).hasNote = true;
  }

  for (const day of map.values()) {
    const decided = day.wins + day.losses;
    day.winRate = decided ? (day.wins / decided) * 100 : null;
    const r = rTotals.get(day.date);
    day.rMultiple = r && r.count ? r.sum : null;
    day.symbols = [...(symbolSets.get(day.date) ?? [])].sort();
    day.netPnl = round2(day.netPnl);
    day.grossPnl = round2(day.grossPnl);
    day.fees = round2(day.fees);
  }

  return map;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* summary metrics                                                     */
/* ------------------------------------------------------------------ */

export type Summary = {
  netPnl: number;
  grossPnl: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  totalR: number | null;
  avgR: number | null;
  tradingDays: number;
  greenDays: number;
  redDays: number;
  flatDays: number;
  greenDayRate: number | null;
  avgDailyPnl: number | null;
  avgDailyR: number | null;
  bestDay: DayRollup | null;
  worstDay: DayRollup | null;
  maxWinStreak: number;
  maxLossStreak: number;
  currentStreak: number;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
};

export function summarize(trades: Trade[], account: Account, days: DayRollup[]): Summary {
  const wins = trades.filter((t) => t.net_pnl > 0);
  const losses = trades.filter((t) => t.net_pnl < 0);
  const breakeven = trades.length - wins.length - losses.length;

  const grossWin = wins.reduce((s, t) => s + t.net_pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0));
  const netPnl = trades.reduce((s, t) => s + t.net_pnl, 0);

  const rValues = trades
    .map((t) => tradeR(t, account))
    .filter((r): r is number => r !== null && Number.isFinite(r));

  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const greenDays = sorted.filter((d) => d.netPnl > 0).length;
  const redDays = sorted.filter((d) => d.netPnl < 0).length;
  const flatDays = sorted.length - greenDays - redDays;

  let maxWinStreak = 0, maxLossStreak = 0, run = 0, currentStreak = 0;
  for (const day of sorted) {
    if (day.netPnl > 0) run = run > 0 ? run + 1 : 1;
    else if (day.netPnl < 0) run = run < 0 ? run - 1 : -1;
    else run = 0;
    maxWinStreak = Math.max(maxWinStreak, run);
    maxLossStreak = Math.min(maxLossStreak, run);
    currentStreak = run;
  }

  // Drawdown on the realized-P&L curve.
  let peak = 0, equity = 0, maxDd = 0, peakEquity = 0;
  for (const day of sorted) {
    equity += day.netPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) {
      maxDd = dd;
      peakEquity = account.starting_balance + peak;
    }
  }

  const decided = wins.length + losses.length;
  const totalR = rValues.length ? rValues.reduce((s, r) => s + r, 0) : null;

  return {
    netPnl: round2(netPnl),
    grossPnl: round2(trades.reduce((s, t) => s + t.gross_pnl, 0)),
    fees: round2(trades.reduce((s, t) => s + t.fees, 0)),
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: decided ? (wins.length / decided) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    expectancy: trades.length ? round2(netPnl / trades.length) : null,
    avgWin: wins.length ? round2(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    largestWin: wins.length ? round2(Math.max(...wins.map((t) => t.net_pnl))) : 0,
    largestLoss: losses.length ? round2(Math.min(...losses.map((t) => t.net_pnl))) : 0,
    totalR: totalR === null ? null : Math.round(totalR * 100) / 100,
    avgR: totalR === null ? null : Math.round((totalR / rValues.length) * 100) / 100,
    tradingDays: sorted.length,
    greenDays,
    redDays,
    flatDays,
    greenDayRate: sorted.length ? (greenDays / sorted.length) * 100 : null,
    avgDailyPnl: sorted.length ? round2(netPnl / sorted.length) : null,
    avgDailyR: sorted.length && totalR !== null ? Math.round((totalR / sorted.length) * 100) / 100 : null,
    bestDay: sorted.length ? sorted.reduce((a, b) => (b.netPnl > a.netPnl ? b : a)) : null,
    worstDay: sorted.length ? sorted.reduce((a, b) => (b.netPnl < a.netPnl ? b : a)) : null,
    maxWinStreak,
    maxLossStreak: Math.abs(maxLossStreak),
    currentStreak,
    maxDrawdown: round2(maxDd),
    maxDrawdownPct: peakEquity > 0 ? round2((maxDd / peakEquity) * 100) : null,
  };
}

/* ------------------------------------------------------------------ */
/* balance + equity curve                                              */
/* ------------------------------------------------------------------ */

export function netCashFlow(events: BalanceEvent[]): number {
  return round2(
    events.filter((e) => CASH_FLOW_KINDS.has(e.kind)).reduce((s, e) => s + e.amount, 0),
  );
}

export function accountBalance(account: Account, allTrades: Trade[], allDayEntries: DayEntry[], events: BalanceEvent[]): number {
  const realized = allTrades.reduce((s, t) => s + t.net_pnl, 0)
    + allDayEntries.reduce((s, d) => s + d.net_pnl, 0);
  return round2(account.starting_balance + netCashFlow(events) + realized);
}

export type EquityPoint = {
  date: string;
  balance: number;
  realized: number;
  cashFlow: number;
  dayPnl: number;
  drawdown: number;
};

export function buildEquityCurve(
  account: Account,
  days: DayRollup[],
  events: BalanceEvent[],
): EquityPoint[] {
  const byDay = new Map<string, number>();
  for (const day of days) byDay.set(day.date, day.netPnl);

  const flows = new Map<string, number>();
  for (const e of events) {
    if (!CASH_FLOW_KINDS.has(e.kind)) continue;
    flows.set(e.event_date, (flows.get(e.event_date) ?? 0) + e.amount);
  }

  const keys = [...new Set([...byDay.keys(), ...flows.keys()])].sort();
  if (!keys.length) return [];

  let balance = account.starting_balance;
  let realized = 0;
  let cash = 0;
  let peak = balance;
  const points: EquityPoint[] = [];

  // Opening point so the curve starts from the account's starting balance.
  points.push({
    date: addDays(keys[0], -1),
    balance: round2(balance),
    realized: 0,
    cashFlow: 0,
    dayPnl: 0,
    drawdown: 0,
  });

  for (const key of keys) {
    const pnl = byDay.get(key) ?? 0;
    const flow = flows.get(key) ?? 0;
    realized += pnl;
    cash += flow;
    balance = account.starting_balance + cash + realized;
    peak = Math.max(peak, balance);
    points.push({
      date: key,
      balance: round2(balance),
      realized: round2(realized),
      cashFlow: round2(cash),
      dayPnl: round2(pnl),
      drawdown: round2(peak > 0 ? ((balance - peak) / peak) * 100 : 0),
    });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* breakdowns                                                          */
/* ------------------------------------------------------------------ */

export type Bucket = {
  key: string;
  label: string;
  netPnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

function bucketize(
  trades: Trade[],
  keyOf: (t: Trade) => string | null,
  labelOf: (key: string) => string = (k) => k,
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const trade of trades) {
    const key = keyOf(trade);
    if (key === null) continue;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, label: labelOf(key), netPnl: 0, trades: 0, wins: 0, losses: 0, winRate: null };
      map.set(key, bucket);
    }
    bucket.netPnl += trade.net_pnl;
    bucket.trades += 1;
    if (trade.net_pnl > 0) bucket.wins += 1;
    else if (trade.net_pnl < 0) bucket.losses += 1;
  }
  return [...map.values()].map((b) => ({
    ...b,
    netPnl: round2(b.netPnl),
    winRate: b.wins + b.losses ? (b.wins / (b.wins + b.losses)) * 100 : null,
  }));
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function bySymbol(trades: Trade[]): Bucket[] {
  return bucketize(trades, (t) => t.symbol).sort((a, b) => b.netPnl - a.netPnl);
}

export function bySide(trades: Trade[]): Bucket[] {
  return bucketize(trades, (t) => t.side, (k) => (k === "long" ? "Long" : "Short"));
}

export function byWeekday(trades: Trade[]): Bucket[] {
  const buckets = bucketize(trades, (t) => String(weekdayIndex(t.close_date)), (k) => WEEKDAYS[Number(k)]);
  return buckets.sort((a, b) => Number(a.key) - Number(b.key));
}

export function byHour(trades: Trade[]): Bucket[] {
  return bucketize(
    trades,
    (t) => (t.closed_at.includes("T") ? t.closed_at.slice(11, 13) : null),
    (k) => `${k}:00`,
  ).sort((a, b) => Number(a.key) - Number(b.key));
}

export function byMonth(days: DayRollup[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const day of days) {
    const key = monthKey(day.date);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, label: formatMonthLabel(key), netPnl: 0, trades: 0, wins: 0, losses: 0, winRate: null };
      map.set(key, bucket);
    }
    bucket.netPnl += day.netPnl;
    bucket.trades += day.trades;
    bucket.wins += day.wins;
    bucket.losses += day.losses;
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      netPnl: round2(b.netPnl),
      winRate: b.wins + b.losses ? (b.wins / (b.wins + b.losses)) * 100 : null,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function byTag(trades: Trade[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const trade of trades) {
    const tags = trade.tags.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { key, label: tag, netPnl: 0, trades: 0, wins: 0, losses: 0, winRate: null };
        map.set(key, bucket);
      }
      bucket.netPnl += trade.net_pnl;
      bucket.trades += 1;
      if (trade.net_pnl > 0) bucket.wins += 1;
      else if (trade.net_pnl < 0) bucket.losses += 1;
    }
  }
  return [...map.values()]
    .map((b) => ({
      ...b,
      netPnl: round2(b.netPnl),
      winRate: b.wins + b.losses ? (b.wins / (b.wins + b.losses)) * 100 : null,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
