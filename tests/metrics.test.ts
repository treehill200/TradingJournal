import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountBalance, accountRiskPerR, addDays, applyFilters, buildDayRollups, buildEquityCurve,
  byHour, byMonth, bySide, bySymbol, byTag, byWeekday, daysBetween, filterDayEntries,
  monthGrid, netCashFlow, startOfWeek, summarize, tradeR, weekdayIndex,
} from "../src/lib/metrics";
import { EMPTY_FILTERS } from "../src/lib/types";
import type { Account, BalanceEvent, DayEntry, Trade } from "../src/lib/types";

const account: Account = {
  id: "a1", user_id: "u1", name: "Test", broker: "", kind: "paper", currency: "USD",
  starting_balance: 10000, risk_mode: "fixed", risk_value: 100, timezone: "UTC",
  is_default: 1, archived: 0, created_at: "", updated_at: "",
};

let n = 0;
function trade(over: Partial<Trade> = {}): Trade {
  n += 1;
  const closedAt = over.closed_at ?? "2026-09-03T10:00:00";
  return {
    id: `t${n}`, account_id: "a1", symbol: "AAPL", side: "long", quantity: 1,
    entry_price: 100, exit_price: 110, stop_price: null, opened_at: null,
    closed_at: closedAt, close_date: closedAt.slice(0, 10),
    gross_pnl: 0, fees: 0, net_pnl: 0, risk_amount: null, r_multiple: null,
    tags: "", notes: "", source: "tradingview", ...over,
  };
}

describe("date helpers", () => {
  it("treats a day key as a calendar day, never a timestamp", () => {
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2024-02-28", 1), "2024-02-29"); // leap year
  });

  it("counts weeks from Monday", () => {
    assert.equal(weekdayIndex("2026-09-07"), 0); // a Monday
    assert.equal(weekdayIndex("2026-09-13"), 6); // the Sunday after
    assert.equal(startOfWeek("2026-09-13"), "2026-09-07");
    assert.equal(startOfWeek("2026-09-07"), "2026-09-07");
  });

  it("builds a six-week grid that starts on a Monday and covers the month", () => {
    const grid = monthGrid(2026, 9);
    assert.equal(grid.length, 42);
    assert.equal(weekdayIndex(grid[0]), 0);
    assert.ok(grid.includes("2026-09-01"));
    assert.ok(grid.includes("2026-09-30"));
  });

  it("walks an inclusive range", () => {
    assert.deepEqual(daysBetween("2026-09-01", "2026-09-03"),
      ["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});

describe("R multiples", () => {
  it("prefers the trade's own stop distance", () => {
    const t = trade({ net_pnl: 200, entry_price: 100, stop_price: 95, quantity: 10 });
    assert.equal(tradeR(t, account), 4); // risked 50
  });

  it("falls back to the account's risk per trade", () => {
    assert.equal(tradeR(trade({ net_pnl: 250 }), account), 2.5);
  });

  it("has no answer when risk is unset", () => {
    const noRisk = { ...account, risk_value: 0 };
    assert.equal(tradeR(trade({ net_pnl: 250 }), noRisk), null);
  });

  it("reads percent risk off the starting balance", () => {
    const pct = { ...account, risk_mode: "percent" as const, risk_value: 1 };
    assert.equal(accountRiskPerR(pct), 100);
    assert.equal(tradeR(trade({ net_pnl: 150 }), pct), 1.5);
  });

  it("lets a stored R win over everything", () => {
    assert.equal(tradeR(trade({ net_pnl: 250, r_multiple: 0.5 }), account), 0.5);
  });
});

describe("day rollups", () => {
  const trades = [
    trade({ close_date: "2026-09-03", net_pnl: 100, gross_pnl: 102, fees: 2, symbol: "AAPL" }),
    trade({ close_date: "2026-09-03", net_pnl: -40, gross_pnl: -38, fees: 2, symbol: "TSLA" }),
    trade({ close_date: "2026-09-03", net_pnl: 0, gross_pnl: 0, symbol: "AAPL" }),
    trade({ close_date: "2026-09-04", net_pnl: -25, gross_pnl: -25 }),
  ];
  const days = buildDayRollups(trades, account, [], []);

  it("groups by closing date", () => {
    assert.deepEqual([...days.keys()].sort(), ["2026-09-03", "2026-09-04"]);
    assert.equal(days.get("2026-09-03")!.trades, 3);
  });

  it("nets P&L and fees per day", () => {
    const d = days.get("2026-09-03")!;
    assert.equal(d.netPnl, 60);
    assert.equal(d.fees, 4);
  });

  it("excludes breakeven trades from the win rate", () => {
    const d = days.get("2026-09-03")!;
    assert.equal(d.wins, 1);
    assert.equal(d.losses, 1);
    assert.equal(d.breakeven, 1);
    assert.equal(d.winRate, 50);
  });

  it("sums R across the day", () => {
    assert.equal(days.get("2026-09-03")!.rMultiple, 0.6); // (100 - 40 + 0) / 100
  });

  it("lists the day's symbols", () => {
    assert.deepEqual(days.get("2026-09-03")!.symbols, ["AAPL", "TSLA"]);
  });

  it("adds manual day entries on top of imported trades", () => {
    const entry: DayEntry = {
      id: "d1", account_id: "a1", date: "2026-09-03", net_pnl: 40,
      trades: 2, wins: 2, losses: 0, r_multiple: null,
    };
    const merged = buildDayRollups(trades, account, [entry], []);
    const d = merged.get("2026-09-03")!;
    assert.equal(d.netPnl, 100);
    assert.equal(d.trades, 5);
    assert.equal(d.manual, true);
  });

  it("marks days that carry a journal entry", () => {
    const withNote = buildDayRollups(trades, account, [], [{
      id: "n1", account_id: "a1", date: "2026-09-04", title: "", body: "Rough day",
      mood: "", rating: null, tags: "", updated_at: "",
    }]);
    assert.equal(withNote.get("2026-09-04")!.hasNote, true);
    assert.equal(withNote.get("2026-09-03")!.hasNote, false);
  });
});

describe("a journal note is not a trading day", () => {
  const trades = [trade({ close_date: "2026-09-03", net_pnl: 100 })];
  const notes = [{
    id: "n1", account_id: "a1", date: "2026-09-20", title: "", body: "Watched, did not trade",
    mood: "", rating: null, tags: "", updated_at: "",
  }];
  const days = buildDayRollups(trades, account, [], notes);

  it("marks the note but flags the day as having no activity", () => {
    const noteOnly = days.get("2026-09-20")!;
    assert.equal(noteOnly.hasNote, true);
    assert.equal(noteOnly.activity, false);
    assert.equal(days.get("2026-09-03")!.activity, true);
  });

  it("keeps it out of the trading-day count and the flat-day tally", () => {
    const s = summarize(trades, account, [...days.values()]);
    assert.equal(s.tradingDays, 1);
    assert.equal(s.flatDays, 0);
    assert.equal(s.greenDayRate, 100);
  });

  it("keeps it out of the equity curve and monthly totals", () => {
    const curve = buildEquityCurve(account, [...days.values()], []);
    assert.equal(curve.some((p) => p.date === "2026-09-20"), false);
    assert.equal(byMonth([...days.values()])[0].trades, 1);
  });

  it("counts a manual day with a real result as activity", () => {
    const entry: DayEntry = {
      id: "d1", account_id: "a1", date: "2026-09-21", net_pnl: 0,
      trades: 0, wins: 0, losses: 0, r_multiple: null,
    };
    const withManual = buildDayRollups(trades, account, [entry], notes);
    assert.equal(withManual.get("2026-09-21")!.activity, true);
  });
});

describe("filterDayEntries", () => {
  const entries: DayEntry[] = [
    { id: "d1", account_id: "a1", date: "2026-09-01", net_pnl: 100, trades: 1, wins: 1, losses: 0, r_multiple: null },
    { id: "d2", account_id: "a1", date: "2026-09-20", net_pnl: -50, trades: 2, wins: 0, losses: 2, r_multiple: null },
  ];

  it("narrows to the date range", () => {
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, from: "2026-09-10" }).length, 1);
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, to: "2026-09-10" }).length, 1);
  });

  it("drops them entirely once a trade-attribute filter is on", () => {
    // A manual day has no symbol, side or tag, so it cannot match one.
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, symbols: ["AAPL"] }).length, 0);
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, sides: ["long"] }).length, 0);
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, result: "wins" }).length, 0);
    assert.equal(filterDayEntries(entries, { ...EMPTY_FILTERS, search: "orb" }).length, 0);
  });

  it("passes everything through when nothing is filtered", () => {
    assert.equal(filterDayEntries(entries, EMPTY_FILTERS).length, 2);
  });
});

describe("summary", () => {
  const trades = [
    trade({ close_date: "2026-09-01", net_pnl: 300, gross_pnl: 300 }),
    trade({ close_date: "2026-09-02", net_pnl: -100, gross_pnl: -100 }),
    trade({ close_date: "2026-09-03", net_pnl: 200, gross_pnl: 200 }),
    trade({ close_date: "2026-09-04", net_pnl: -50, gross_pnl: -50 }),
  ];
  const days = [...buildDayRollups(trades, account, [], []).values()];
  const s = summarize(trades, account, days);

  it("adds up the basics", () => {
    assert.equal(s.netPnl, 350);
    assert.equal(s.trades, 4);
    assert.equal(s.wins, 2);
    assert.equal(s.losses, 2);
    assert.equal(s.winRate, 50);
  });

  it("computes profit factor and expectancy", () => {
    assert.equal(s.profitFactor, 500 / 150);
    assert.equal(s.expectancy, 87.5);
    assert.equal(s.avgWin, 250);
    assert.equal(s.avgLoss, 75);
  });

  it("reports profit factor as infinite when nothing lost", () => {
    const onlyWins = [trade({ net_pnl: 10, gross_pnl: 10 })];
    const d = [...buildDayRollups(onlyWins, account, [], []).values()];
    assert.equal(summarize(onlyWins, account, d).profitFactor, Infinity);
  });

  it("counts green and red days", () => {
    assert.equal(s.tradingDays, 4);
    assert.equal(s.greenDays, 2);
    assert.equal(s.redDays, 2);
    assert.equal(s.greenDayRate, 50);
  });

  it("finds the best and worst day", () => {
    assert.equal(s.bestDay!.date, "2026-09-01");
    assert.equal(s.worstDay!.date, "2026-09-02");
  });

  it("measures drawdown from the running peak", () => {
    // +300, then -100 -> the deepest trough below the 300 peak is 100
    assert.equal(s.maxDrawdown, 100);
  });

  it("tracks day streaks", () => {
    const streaky = [
      trade({ close_date: "2026-09-01", net_pnl: 10 }),
      trade({ close_date: "2026-09-02", net_pnl: 10 }),
      trade({ close_date: "2026-09-03", net_pnl: 10 }),
      trade({ close_date: "2026-09-04", net_pnl: -10 }),
      trade({ close_date: "2026-09-05", net_pnl: -10 }),
    ];
    const d = [...buildDayRollups(streaky, account, [], []).values()];
    const st = summarize(streaky, account, d);
    assert.equal(st.maxWinStreak, 3);
    assert.equal(st.maxLossStreak, 2);
    assert.equal(st.currentStreak, -2);
  });

  it("copes with no trades at all", () => {
    const empty = summarize([], account, []);
    assert.equal(empty.netPnl, 0);
    assert.equal(empty.winRate, null);
    assert.equal(empty.bestDay, null);
    assert.equal(empty.greenDayRate, null);
  });
});

describe("balance and equity", () => {
  const events: BalanceEvent[] = [
    { id: "b1", account_id: "a1", kind: "deposit", amount: 5000, balance: null,
      occurred_at: "2026-09-01T00:00:00", event_date: "2026-09-01", note: "", source: "csv" },
    { id: "b2", account_id: "a1", kind: "withdrawal", amount: -1000, balance: null,
      occurred_at: "2026-09-04T00:00:00", event_date: "2026-09-04", note: "", source: "csv" },
    { id: "b3", account_id: "a1", kind: "fee", amount: -25, balance: null,
      occurred_at: "2026-09-04T00:00:00", event_date: "2026-09-04", note: "", source: "csv" },
    { id: "b4", account_id: "a1", kind: "pnl", amount: 999, balance: null,
      occurred_at: "2026-09-04T00:00:00", event_date: "2026-09-04", note: "", source: "csv" },
  ];

  it("counts only rows that move cash and are not already in the trades", () => {
    assert.equal(netCashFlow(events), 4000); // fee and pnl rows excluded
  });

  it("is starting balance plus cash flow plus realized P&L", () => {
    const trades = [trade({ net_pnl: 250 })];
    assert.equal(accountBalance(account, trades, [], events), 14250);
  });

  it("includes manual day entries in the balance", () => {
    const entry: DayEntry = {
      id: "d1", account_id: "a1", date: "2026-09-02", net_pnl: 100,
      trades: 1, wins: 1, losses: 0, r_multiple: null,
    };
    assert.equal(accountBalance(account, [], [entry], []), 10100);
  });

  it("opens the curve at the starting balance, the day before the first activity", () => {
    const trades = [trade({ close_date: "2026-09-02", net_pnl: 100 })];
    const days = [...buildDayRollups(trades, account, [], []).values()];
    const curve = buildEquityCurve(account, days, []);
    assert.equal(curve[0].date, "2026-09-01");
    assert.equal(curve[0].balance, 10000);
  });

  it("moves with both P&L and cash flows, and tracks drawdown", () => {
    const trades = [
      trade({ close_date: "2026-09-02", net_pnl: 500 }),
      trade({ close_date: "2026-09-03", net_pnl: -200 }),
    ];
    const days = [...buildDayRollups(trades, account, [], []).values()];
    const curve = buildEquityCurve(account, days, events);
    const byDate = Object.fromEntries(curve.map((p) => [p.date, p]));
    assert.equal(byDate["2026-09-01"].balance, 15000); // deposit
    assert.equal(byDate["2026-09-02"].balance, 15500);
    assert.equal(byDate["2026-09-03"].balance, 15300);
    assert.equal(byDate["2026-09-04"].balance, 14300); // withdrawal
    assert.ok(byDate["2026-09-03"].drawdown < 0);
    assert.equal(byDate["2026-09-02"].drawdown, 0);
  });

  it("is empty when there is nothing to plot", () => {
    assert.deepEqual(buildEquityCurve(account, [], []), []);
  });
});

describe("filters", () => {
  const trades = [
    trade({ close_date: "2026-09-01", symbol: "AAPL", side: "long", net_pnl: 10, tags: "orb, a+" }),
    trade({ close_date: "2026-09-05", symbol: "TSLA", side: "short", net_pnl: -10, tags: "fade" }),
    trade({ close_date: "2026-09-10", symbol: "AAPL", side: "short", net_pnl: 0, notes: "chop" }),
  ];
  const f = (over: object) => applyFilters(trades, { ...EMPTY_FILTERS, ...over });

  it("filters on the closing date range, inclusively", () => {
    assert.equal(f({ from: "2026-09-05" }).length, 2);
    assert.equal(f({ to: "2026-09-05" }).length, 2);
    assert.equal(f({ from: "2026-09-05", to: "2026-09-05" }).length, 1);
  });

  it("filters by symbol, case-insensitively", () => {
    assert.equal(f({ symbols: ["aapl"] }).length, 2);
  });

  it("matches whole tags, not substrings", () => {
    assert.equal(f({ tags: ["a"] }).length, 0); // must not match "a+" or "fade"
    assert.equal(f({ tags: ["a+"] }).length, 1);
  });

  it("filters by side, tag and free text", () => {
    assert.equal(f({ sides: ["short"] }).length, 2);
    assert.equal(f({ tags: ["orb"] }).length, 1);
    assert.equal(f({ search: "chop" }).length, 1);
  });

  it("treats breakeven as neither a win nor a loss", () => {
    assert.equal(f({ result: "wins" }).length, 1);
    assert.equal(f({ result: "losses" }).length, 1);
  });

  it("combines filters with AND", () => {
    assert.equal(f({ symbols: ["AAPL"], sides: ["long"] }).length, 1);
  });
});

describe("breakdowns", () => {
  const trades = [
    trade({ close_date: "2026-09-01", closed_at: "2026-09-01T10:30:00", symbol: "AAPL", side: "long", net_pnl: 100, tags: "orb" }),
    trade({ close_date: "2026-09-01", closed_at: "2026-09-01T10:45:00", symbol: "TSLA", side: "short", net_pnl: -40, tags: "orb, fade" }),
    trade({ close_date: "2026-09-08", closed_at: "2026-09-08T15:00:00", symbol: "AAPL", side: "long", net_pnl: 60 }),
  ];

  it("ranks symbols by P&L", () => {
    const b = bySymbol(trades);
    assert.deepEqual(b.map((x) => [x.label, x.netPnl]), [["AAPL", 160], ["TSLA", -40]]);
    assert.equal(b[0].winRate, 100);
  });

  it("splits long and short", () => {
    assert.deepEqual(bySide(trades).map((x) => x.label).sort(), ["Long", "Short"]);
  });

  it("buckets by weekday and hour of the close", () => {
    assert.deepEqual(byWeekday(trades).map((x) => x.label), ["Tuesday"]);
    assert.deepEqual(byHour(trades).map((x) => x.label), ["10:00", "15:00"]);
  });

  it("counts a trade once per tag", () => {
    const b = byTag(trades);
    assert.equal(b.find((x) => x.label === "orb")!.trades, 2);
    assert.equal(b.find((x) => x.label === "fade")!.trades, 1);
  });

  it("rolls days up into months in order", () => {
    const days = [...buildDayRollups(trades, account, [], []).values()];
    const months = byMonth(days);
    assert.equal(months.length, 1);
    assert.equal(months[0].netPnl, 120);
  });
});
