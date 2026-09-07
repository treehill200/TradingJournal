import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDelimited } from "../src/lib/csv";
import { analyze, buildMapping, sideFromValue, balanceKindFromValue } from "../src/lib/tradingview";

const PAPER_ORDERS = `Symbol,Side,Type,Qty,Limit Price,Stop Price,Fill Price,Status,Commission,Leverage,Margin,Take Profit,Stop Loss,Expiration,Order id,Placing Time,Closing Time
NASDAQ:AAPL,Buy,Market,100,,,189.50,Filled,1.00,,,,,GTC,1001,2026-09-03 09:31:02,2026-09-03 09:31:02
NASDAQ:AAPL,Sell,Market,100,,,191.20,Filled,1.00,,,,,GTC,1002,2026-09-03 10:15:44,2026-09-03 10:15:44
NASDAQ:TSLA,Sell,Market,50,,,242.10,Filled,1.00,,,,,GTC,1003,2026-09-03 11:02:00,2026-09-03 11:02:00
NASDAQ:TSLA,Buy,Market,50,,,239.80,Filled,1.00,,,,,GTC,1004,2026-09-03 13:44:10,2026-09-03 13:44:10
NASDAQ:AAPL,Buy,Limit,100,188.00,,,Cancelled,0.00,,,,,GTC,1005,2026-09-03 14:00:00,2026-09-03 15:00:00
`;

const BROKER_CLOSED = `Symbol,Side,Qty,Entry Price,Exit Price,Open Time,Close Time,Commission,Swap,Net P&L
EURUSD,Buy,10000,1.08500,1.08720,04/09/2026 08:00:00,04/09/2026 11:30:00,2.50,0.00,19.50
XAUUSD,Buy,2,2410.50,2398.20,05/09/2026 13:00:00,05/09/2026 16:40:00,4.00,0.00,-28.60
`;

const STRATEGY_TESTER = `Trade #,Type,Signal,Date/Time,Price USD,Contracts,Profit USD,Profit %,Cumulative profit USD
1,Entry long,Long,2026-09-01 09:30,4500.25,2,,,
1,Exit long,Close,2026-09-01 11:00,4512.75,2,25.00,0.28,25.00
2,Entry short,Short,2026-09-02 10:00,4520.00,2,,,
2,Exit short,Close,2026-09-02 14:30,4530.50,2,-21.00,-0.23,4.00
`;

const BALANCE = `Time,Type,Amount,Balance,Description
2026-09-01 00:00:00,Deposit,10000.00,10000.00,Initial funding
2026-09-03 23:59:00,Commission,-3.00,9997.00,Daily commissions
2026-09-05 12:00:00,Withdrawal,-500.00,9497.00,Payout
`;

const run = (csv: string, opts = {}) => analyze(parseDelimited(csv), opts);

describe("column mapping", () => {
  it("never lets 'Take Profit' become the P&L column", () => {
    const mapping = buildMapping(parseDelimited(PAPER_ORDERS).headers);
    assert.equal(mapping.netPnl, undefined);
    assert.notEqual(mapping.takeProfit, undefined);
  });

  it("prefers the money column over the percent column", () => {
    const { headers } = parseDelimited(STRATEGY_TESTER);
    const mapping = buildMapping(headers);
    assert.equal(headers[mapping.netPnl!], "Profit USD");
  });

  it("accepts an explicit override", () => {
    const { headers } = parseDelimited(BROKER_CLOSED);
    const mapping = buildMapping(headers, { netPnl: "Commission" });
    assert.equal(headers[mapping.netPnl!], "Commission");
  });
});

describe("layout detection", () => {
  it("recognises order fills", () => {
    const a = run(PAPER_ORDERS);
    assert.equal(a.dataset, "trades");
    assert.equal(a.mode, "fills");
  });

  it("recognises closed trades", () => {
    assert.equal(run(BROKER_CLOSED).mode, "closed");
  });

  it("recognises entry/exit pairs", () => {
    assert.equal(run(STRATEGY_TESTER).mode, "paired");
  });

  it("recognises balance history", () => {
    assert.equal(run(BALANCE).dataset, "balance");
  });
});

describe("FIFO matching of order fills", () => {
  const a = run(PAPER_ORDERS);

  it("pairs each buy with its sell and skips cancelled orders", () => {
    assert.equal(a.trades.length, 2);
    assert.equal(a.skipped, 1);
  });

  it("computes P&L net of both legs' commission", () => {
    const aapl = a.trades.find((t) => t.symbol === "NASDAQ:AAPL")!;
    assert.equal(aapl.side, "long");
    assert.equal(aapl.grossPnl, 170); // (191.20 - 189.50) * 100
    assert.equal(aapl.fees, 2);
    assert.equal(aapl.netPnl, 168);
  });

  it("gets the direction right on a short round trip", () => {
    const tsla = a.trades.find((t) => t.symbol === "NASDAQ:TSLA")!;
    assert.equal(tsla.side, "short");
    assert.equal(tsla.netPnl, 113); // (242.10 - 239.80) * 50 - 2
  });

  it("dates a trade by its closing fill", () => {
    for (const t of a.trades) assert.equal(t.closeDate, "2026-09-03");
    const aapl = a.trades.find((t) => t.symbol === "NASDAQ:AAPL")!;
    assert.equal(aapl.closedAt, "2026-09-03T10:15:44");
    assert.equal(aapl.openedAt, "2026-09-03T09:31:02");
  });

  it("reports a position left open instead of counting it", () => {
    const partial = PAPER_ORDERS.split("\n").slice(0, 2).join("\n") + "\n"; // header + one buy
    const open = analyze(parseDelimited(partial));
    assert.equal(open.trades.length, 0);
    assert.equal(open.openPositions, 1);
  });

  it("splits one exit across two entries", () => {
    const csv = `Symbol,Side,Qty,Fill Price,Close Time,Order id
ES,Buy,1,100,2026-09-01 09:00:00,1
ES,Buy,1,102,2026-09-01 09:30:00,2
ES,Sell,2,105,2026-09-01 10:00:00,3
`;
    const a2 = analyze(parseDelimited(csv));
    assert.equal(a2.trades.length, 2);
    assert.deepEqual(a2.trades.map((t) => t.netPnl).sort((x, y) => x - y), [3, 5]);
  });
});

describe("closed-trade rows", () => {
  it("uses the file's own P&L and closing date", () => {
    const a = run(BROKER_CLOSED, { dayFirst: true });
    assert.equal(a.trades.length, 2);
    const eur = a.trades.find((t) => t.symbol === "EURUSD")!;
    assert.equal(eur.netPnl, 19.5);
    assert.equal(eur.closeDate, "2026-09-04");
  });

  it("reads the same file the other way round when told to", () => {
    const a = run(BROKER_CLOSED, { dayFirst: false });
    assert.equal(a.trades.find((t) => t.symbol === "EURUSD")!.closeDate, "2026-04-09");
  });

  it("warns that the dates could be read either way", () => {
    assert.match(run(BROKER_CLOSED).warnings.join(" "), /can be read either way/);
  });

  it("stays quiet when the dates are unambiguous", () => {
    assert.equal(run(PAPER_ORDERS).warnings.some((w) => /either way/.test(w)), false);
  });
});

describe("entry/exit pairs", () => {
  const a = run(STRATEGY_TESTER);

  it("collapses two rows into one trade dated by the exit", () => {
    assert.equal(a.trades.length, 2);
    assert.equal(a.trades[0].closeDate, "2026-09-01");
    assert.equal(a.trades[0].entryPrice, 4500.25);
    assert.equal(a.trades[0].exitPrice, 4512.75);
  });

  it("keeps the exported P&L and the trade's direction", () => {
    assert.deepEqual(a.trades.map((t) => [t.side, t.netPnl]), [["long", 25], ["short", -21]]);
  });

  it("labels rows when the export has no symbol column", () => {
    const labelled = run(STRATEGY_TESTER, { symbol: "es1!" });
    assert.deepEqual([...new Set(labelled.trades.map((t) => t.symbol))], ["ES1!"]);
  });

  it("keeps two instruments apart when the rows are otherwise identical", () => {
    const a1 = run(STRATEGY_TESTER, { symbol: "ES1!" });
    const a2 = run(STRATEGY_TESTER, { symbol: "NQ1!" });
    assert.notEqual(a1.trades[0].dedupeKey, a2.trades[0].dedupeKey);
  });
});

describe("balance history", () => {
  const a = run(BALANCE);

  it("classifies each row", () => {
    assert.deepEqual(a.events.map((e) => e.kind), ["deposit", "fee", "withdrawal"]);
  });

  it("keeps the broker's running balance and the event date", () => {
    assert.equal(a.events[0].balance, 10000);
    assert.equal(a.events[2].eventDate, "2026-09-05");
    assert.equal(a.events[2].amount, -500);
  });

  it("derives an amount from the balance delta when there is no amount column", () => {
    const csv = `Time,Type,Balance\n2026-09-01 00:00:00,Deposit,10000\n2026-09-02 00:00:00,Deposit,10500\n`;
    const a2 = analyze(parseDelimited(csv));
    assert.equal(a2.events.length, 1);
    assert.equal(a2.events[0].amount, 500);
  });

  it("refuses to invent an opening movement, and says why", () => {
    const csv = `Time,Type,Balance\n2026-09-01 00:00:00,Deposit,10000\n2026-09-02 00:00:00,Deposit,10500\n`;
    const a2 = analyze(parseDelimited(csv));
    assert.equal(a2.skipped, 1);
    assert.match(a2.warnings.join(" "), /no earlier balance/);
  });
});

describe("dedupe keys", () => {
  it("are stable across identical exports", () => {
    const first = run(PAPER_ORDERS).trades.map((t) => t.dedupeKey);
    const second = run(PAPER_ORDERS).trades.map((t) => t.dedupeKey);
    assert.deepEqual(first, second);
  });

  it("survive a later export that appends new rows", () => {
    const extended = PAPER_ORDERS +
      `NASDAQ:NVDA,Buy,Market,30,,,120.00,Filled,1.00,,,,,GTC,1008,2026-09-05 10:00:00,2026-09-05 10:00:00\n` +
      `NASDAQ:NVDA,Sell,Market,30,,,124.40,Filled,1.00,,,,,GTC,1009,2026-09-05 15:30:00,2026-09-05 15:30:00\n`;
    const before = new Set(run(PAPER_ORDERS).trades.map((t) => t.dedupeKey));
    const after = run(extended).trades.map((t) => t.dedupeKey);
    assert.equal(after.length, 3);
    assert.equal(after.filter((k) => before.has(k)).length, 2, "old trades must keep their keys");
  });

  it("are unique within one file", () => {
    const keys = run(BROKER_CLOSED).trades.map((t) => t.dedupeKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("collapse a row repeated inside one file", () => {
    const doubled = BROKER_CLOSED + BROKER_CLOSED.split("\n").slice(1, 2).join("\n") + "\n";
    assert.equal(run(doubled).trades.length, 2);
  });
});

describe("value classifiers", () => {
  it("reads sides in broker dialects", () => {
    assert.equal(sideFromValue("Buy"), "long");
    assert.equal(sideFromValue("SELL"), "short");
    assert.equal(sideFromValue("Buy to cover"), "long");
    assert.equal(sideFromValue("Market"), null);
  });

  it("reads balance event kinds", () => {
    assert.equal(balanceKindFromValue("Deposit"), "deposit");
    assert.equal(balanceKindFromValue("Cash withdrawal"), "withdrawal");
    assert.equal(balanceKindFromValue("Commission"), "fee");
    assert.equal(balanceKindFromValue("Dividend"), "dividend");
    assert.equal(balanceKindFromValue("Realized P/L"), "pnl");
  });
});
