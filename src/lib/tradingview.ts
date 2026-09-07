/**
 * Turns a TradingView (or broker) CSV export into normalized trades or
 * balance events.
 *
 * TradingView does not have one export shape, so this recognises three:
 *
 *   closed  - one row per finished trade, with a P&L column
 *             (broker "History"/"Positions" exports)
 *   paired  - two rows per trade, "Entry long" / "Exit short" etc. sharing a
 *             trade number (Strategy Tester "List of Trades")
 *   fills   - one row per order fill, which are matched FIFO into round trips
 *             (Paper Trading "History" order exports)
 *
 * plus balance history (deposits, withdrawals, fees, adjustments).
 *
 * Whatever the shape, a trade is dated by *when it closed*.
 */

import { createHash } from "node:crypto";
import { detectDayFirst, normalizeHeader, parseDateTime, parseNumber, type Table } from "./csv";

export type Dataset = "trades" | "balance";
export type TradeMode = "closed" | "paired" | "fills";

export type Field =
  | "symbol" | "side" | "quantity" | "entryPrice" | "exitPrice" | "price" | "stopPrice" | "takeProfit"
  | "openTime" | "closeTime" | "time" | "netPnl" | "grossPnl" | "commission" | "swap"
  | "orderId" | "tradeId" | "status" | "type" | "amount" | "balance" | "note";

const ALIASES: Record<Field, string[]> = {
  symbol: ["symbol", "ticker", "instrument", "market", "pair", "contract", "asset", "security", "product", "name"],
  side: ["side", "direction", "action", "buy_sell", "b_s", "order_side", "position_side", "long_short", "trade_side", "transaction_type"],
  quantity: ["qty", "quantity", "size", "contracts", "volume", "lots", "shares", "units", "filled_qty", "executed_qty", "position_size", "amount_of_shares", "traded_volume", "closing_qty"],
  entryPrice: ["entry_price", "entry", "open_price", "avg_entry_price", "price_open", "opening_price", "buy_price", "entry_price_usd", "average_entry"],
  exitPrice: ["exit_price", "exit", "close_price", "avg_exit_price", "price_close", "closing_price", "sell_price", "exit_price_usd", "average_exit"],
  price: ["price", "fill_price", "avg_price", "average_price", "execution_price", "filled_price", "traded_price", "price_usd", "avg_fill_price", "limit_price"],
  stopPrice: ["stop_loss", "sl", "stop_price", "stop", "stop_loss_price"],
  takeProfit: ["take_profit", "tp", "target_price", "take_profit_price", "profit_target"],
  openTime: ["open_time", "opening_time", "entry_time", "time_opened", "date_open", "open_date", "entry_date", "placing_time", "placed_time", "order_time", "created_time", "entry_date_time", "opened"],
  closeTime: ["close_time", "closing_time", "exit_time", "time_closed", "date_close", "close_date", "closing_date", "exit_date", "closed", "exit_date_time", "fill_time", "filled_time", "execution_time", "transaction_time", "settlement_date"],
  time: ["time", "date", "date_time", "datetime", "timestamp", "trade_time", "when", "date_time_utc"],
  netPnl: ["net_p_l", "net_pnl", "net_profit", "realized_p_l", "realized_pnl", "realised_p_l", "realised_pnl", "p_l", "pnl", "profit_loss", "profit", "p_l_usd", "net_p_l_usd", "result", "realized", "closed_p_l", "gain_loss", "p_l_value", "profit_amount"],
  grossPnl: ["gross_p_l", "gross_pnl", "gross_profit", "gross_p_l_usd"],
  commission: ["commission", "commissions", "fee", "fees", "commission_usd", "commission_paid", "total_fees", "broker_fee"],
  swap: ["swap", "rollover", "financing", "overnight_fee", "borrow_fee", "interest_charge", "funding"],
  orderId: ["order_id", "ticket", "deal_id", "execution_id", "exec_id", "fill_id", "transaction_id", "reference", "ref", "id"],
  tradeId: ["trade_id", "trade", "trade_number", "trade_no", "position_id", "deal", "trade_num"],
  status: ["status", "order_status", "state"],
  type: ["type", "order_type", "event", "event_type", "activity", "operation", "kind", "category", "signal", "action_type"],
  amount: ["amount", "value", "cash", "net_amount", "credit_debit", "change", "amount_usd", "cash_flow", "sum"],
  balance: ["balance", "account_balance", "running_balance", "equity", "balance_after", "closing_balance", "new_balance"],
  note: ["note", "notes", "comment", "description", "remark", "memo", "reason", "label"],
};

// Most specific fields first, so a loose alias cannot steal a column that a
// precise one wants ("Take Profit" must not become the P&L column).
const RESOLUTION_ORDER: Field[] = [
  "takeProfit", "stopPrice", "netPnl", "grossPnl", "entryPrice", "exitPrice", "closeTime",
  "openTime", "symbol", "quantity", "commission", "swap", "balance", "tradeId", "status",
  "amount", "price", "side", "type", "time", "orderId", "note",
];

export type Mapping = Partial<Record<Field, number>>;

export function buildMapping(headers: string[], override: Partial<Record<Field, string>> = {}): Mapping {
  const norm = headers.map(normalizeHeader);
  const mapping: Mapping = {};
  const taken = new Set<number>();

  for (const [field, header] of Object.entries(override) as [Field, string][]) {
    const idx = headers.indexOf(header);
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  }

  const claim = (field: Field, idx: number) => {
    if (mapping[field] !== undefined || taken.has(idx)) return;
    mapping[field] = idx;
    taken.add(idx);
  };

  // Phase 1: every exact header match, across all fields, wins first.
  for (const field of RESOLUTION_ORDER) {
    if (mapping[field] !== undefined) continue;
    for (const alias of ALIASES[field]) {
      const idx = norm.indexOf(alias);
      if (idx >= 0 && !taken.has(idx)) {
        claim(field, idx);
        break;
      }
    }
  }

  // Phase 2: fall back to whole-word prefix/suffix matches such as
  // "net_p_l_usd" -> netPnl, but never a match buried mid-header.
  for (const field of RESOLUTION_ORDER) {
    if (mapping[field] !== undefined) continue;
    for (const alias of ALIASES[field]) {
      const idx = norm.findIndex(
        (h, i) => !taken.has(i) && (h.startsWith(`${alias}_`) || h.endsWith(`_${alias}`)),
      );
      if (idx >= 0) {
        claim(field, idx);
        break;
      }
    }
  }
  return mapping;
}

/* ------------------------------------------------------------------ */
/* value helpers                                                       */
/* ------------------------------------------------------------------ */

function cell(row: string[], idx: number | undefined): string {
  return idx === undefined ? "" : (row[idx] ?? "").trim();
}

function num(row: string[], idx: number | undefined): number | null {
  return idx === undefined ? null : parseNumber(row[idx]);
}

export function sideFromValue(value: string): "long" | "short" | null {
  const v = value.toLowerCase();
  if (/\b(buy|long|bought|bot|b)\b/.test(v)) return "long";
  if (/\b(sell|short|sold|sld|s)\b/.test(v)) return "short";
  return null;
}

function isEntry(value: string): boolean {
  return /\b(entry|open|opened|in)\b/i.test(value);
}
function isExit(value: string): boolean {
  return /\b(exit|close|closed|out)\b/i.test(value);
}

const DEAD_STATUS = /\b(cancel|reject|expired|working|pending|placed|inactive|new|open|queued|submitted)\b/i;

export function balanceKindFromValue(value: string): string {
  const v = value.toLowerCase();
  if (/withdraw|payout|debit_transfer/.test(v)) return "withdrawal";
  if (/deposit|fund(ing)?\b|top.?up|credit_transfer/.test(v)) return "deposit";
  if (/transfer/.test(v)) return "transfer";
  if (/commission|fee|charge/.test(v)) return "fee";
  if (/interest|swap|rollover/.test(v)) return "interest";
  if (/dividend|coupon/.test(v)) return "dividend";
  if (/adjust|correction|rebate|bonus/.test(v)) return "adjustment";
  if (/p.?[&/]?.?l|profit|loss|trade|realized|realised|settle/.test(v)) return "pnl";
  return "unknown";
}

export { CASH_FLOW_KINDS } from "./constants";

function hashKey(parts: (string | number | null | undefined)[]): string {
  return "h:" + createHash("sha256").update(parts.map((p) => (p ?? "")).join("|")).digest("hex").slice(0, 32);
}

function round(value: number, dp = 8): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/* ------------------------------------------------------------------ */
/* output types                                                        */
/* ------------------------------------------------------------------ */

export type NormalizedTrade = {
  dedupeKey: string;
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number | null;
  exitPrice: number | null;
  stopPrice: number | null;
  openedAt: string | null;
  closedAt: string;
  closeDate: string;
  grossPnl: number;
  fees: number;
  netPnl: number;
  note: string;
  raw: Record<string, string>;
};

export type NormalizedBalanceEvent = {
  dedupeKey: string;
  kind: string;
  amount: number;
  balance: number | null;
  occurredAt: string;
  eventDate: string;
  note: string;
  raw: Record<string, string>;
};

export type Analysis = {
  dataset: Dataset;
  mode: TradeMode;
  mapping: Mapping;
  headers: string[];
  mappedColumns: { field: Field; header: string }[];
  unmappedColumns: string[];
  rowsRead: number;
  dayFirst: boolean;
  trades: NormalizedTrade[];
  events: NormalizedBalanceEvent[];
  skipped: number;
  openPositions: number;
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* detection                                                           */
/* ------------------------------------------------------------------ */

function sample(table: Table, idx: number | undefined, limit = 300): string[] {
  if (idx === undefined) return [];
  const out: string[] = [];
  for (const row of table.rows) {
    const v = (row[idx] ?? "").trim();
    if (v) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export function detectDataset(table: Table, mapping: Mapping): Dataset {
  const typeValues = sample(table, mapping.type, 80);
  const balanceish = typeValues.filter((v) => {
    const k = balanceKindFromValue(v);
    return k !== "unknown" && k !== "pnl";
  }).length;

  const hasInstrument = mapping.symbol !== undefined && sample(table, mapping.symbol, 20).length > 0;
  const hasQty = mapping.quantity !== undefined;
  const hasPrices = mapping.price !== undefined || mapping.entryPrice !== undefined || mapping.exitPrice !== undefined;

  if (typeValues.length && balanceish / typeValues.length > 0.6) return "balance";
  if (mapping.balance !== undefined && !hasQty && !hasPrices) return "balance";
  if (mapping.amount !== undefined && !hasInstrument && !hasQty) return "balance";
  return "trades";
}

export function detectMode(table: Table, mapping: Mapping): TradeMode {
  const typeValues = sample(table, mapping.type, 80);
  const entryExit = typeValues.filter((v) => isEntry(v) || isExit(v)).length;
  if (typeValues.length && entryExit / typeValues.length > 0.6) return "paired";

  const hasPnl = mapping.netPnl !== undefined || mapping.grossPnl !== undefined;
  const hasBothPrices = mapping.entryPrice !== undefined && mapping.exitPrice !== undefined;
  const hasBothTimes = mapping.openTime !== undefined && mapping.closeTime !== undefined;
  if (hasPnl && (hasBothPrices || hasBothTimes)) return "closed";

  const hasSide = mapping.side !== undefined || mapping.type !== undefined;
  const looksLikeFills = hasSide && mapping.quantity !== undefined && mapping.price !== undefined;
  if (looksLikeFills && !hasPnl) return "fills";
  if (hasPnl) return "closed";
  return "fills";
}

/* ------------------------------------------------------------------ */
/* normalisation                                                       */
/* ------------------------------------------------------------------ */

function rawOf(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    const v = (row[i] ?? "").trim();
    if (v) out[h] = v;
  });
  return out;
}

function pickTime(
  row: string[],
  mapping: Mapping,
  dayFirst: boolean,
  order: (keyof Mapping)[],
) {
  for (const field of order) {
    const parsed = parseDateTime(cell(row, mapping[field as Field]), { dayFirst });
    if (parsed) return parsed;
  }
  return null;
}

function readSide(row: string[], mapping: Mapping): "long" | "short" | null {
  return (
    sideFromValue(cell(row, mapping.side)) ??
    sideFromValue(cell(row, mapping.type)) ??
    null
  );
}

function feesOf(row: string[], mapping: Mapping): number {
  const commission = num(row, mapping.commission) ?? 0;
  const swap = num(row, mapping.swap) ?? 0;
  // Brokers write costs either as negatives or as positive "you paid" numbers;
  // normalise to a positive cost.
  return Math.abs(commission) + Math.abs(swap);
}

function normalizeClosed(table: Table, mapping: Mapping, dayFirst: boolean) {
  const trades: NormalizedTrade[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const row of table.rows) {
    const status = cell(row, mapping.status);
    if (status && DEAD_STATUS.test(status) && !/filled|closed|done/i.test(status)) {
      skipped++;
      continue;
    }
    const closed = pickTime(row, mapping, dayFirst, ["closeTime", "time", "openTime"]);
    if (!closed) {
      skipped++;
      continue;
    }
    const opened = pickTime(row, mapping, dayFirst, ["openTime"]);
    const gross = num(row, mapping.grossPnl);
    const net = num(row, mapping.netPnl);
    const fees = feesOf(row, mapping);
    if (gross === null && net === null) {
      skipped++;
      continue;
    }
    const netPnl = net !== null ? net : (gross as number) - fees;
    const grossPnl = gross !== null ? gross : netPnl + fees;

    const symbol = (cell(row, mapping.symbol) || "—").toUpperCase();
    const side = readSide(row, mapping) ?? (netPnl >= 0 ? "long" : "long");
    const quantity = Math.abs(num(row, mapping.quantity) ?? 0);
    const entryPrice = num(row, mapping.entryPrice) ?? num(row, mapping.price);
    const exitPrice = num(row, mapping.exitPrice);
    const brokerId = cell(row, mapping.tradeId) || cell(row, mapping.orderId);

    trades.push({
      dedupeKey: brokerId
        ? `id:${symbol}:${brokerId}`
        : hashKey(["closed", symbol, side, round(quantity), round(entryPrice ?? 0), round(exitPrice ?? 0), closed.iso, round(netPnl, 4)]),
      symbol,
      side,
      quantity,
      entryPrice,
      exitPrice,
      stopPrice: num(row, mapping.stopPrice),
      openedAt: opened?.iso ?? null,
      closedAt: closed.iso,
      closeDate: closed.date,
      grossPnl: round(grossPnl, 4),
      fees: round(fees, 4),
      netPnl: round(netPnl, 4),
      note: cell(row, mapping.note),
      raw: rawOf(table.headers, row),
    });
  }
  if (!trades.length && table.rows.length) {
    warnings.push("No rows had both a usable closing date and a P&L value.");
  }
  return { trades, skipped, warnings, openPositions: 0 };
}

function normalizePaired(table: Table, mapping: Mapping, dayFirst: boolean) {
  const trades: NormalizedTrade[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  type Leg = { row: string[]; kind: "entry" | "exit"; key: string; index: number };
  const legs: Leg[] = [];
  table.rows.forEach((row, index) => {
    const typeValue = cell(row, mapping.type);
    const kind = isExit(typeValue) ? "exit" : isEntry(typeValue) ? "entry" : null;
    if (!kind) {
      skipped++;
      return;
    }
    const key = cell(row, mapping.tradeId) || cell(row, mapping.orderId) || `#${Math.floor(index / 2)}`;
    legs.push({ row, kind, key, index });
  });

  const groups = new Map<string, Leg[]>();
  for (const leg of legs) {
    const list = groups.get(leg.key) ?? [];
    list.push(leg);
    groups.set(leg.key, list);
  }

  for (const [key, list] of groups) {
    const entry = list.find((l) => l.kind === "entry");
    const exit = list.find((l) => l.kind === "exit");
    if (!exit) {
      skipped += list.length;
      continue;
    }
    const closed = pickTime(exit.row, mapping, dayFirst, ["closeTime", "time", "openTime"]);
    if (!closed) {
      skipped += list.length;
      continue;
    }
    const opened = entry ? pickTime(entry.row, mapping, dayFirst, ["time", "openTime", "closeTime"]) : null;

    const typeValue = cell(exit.row, mapping.type) || cell(entry?.row ?? [], mapping.type);
    const side = /short/i.test(typeValue) ? "short" : /long/i.test(typeValue) ? "long" : (readSide(exit.row, mapping) ?? "long");

    const quantity = Math.abs(
      num(exit.row, mapping.quantity) ?? num(entry?.row ?? [], mapping.quantity) ?? 0,
    );
    const entryPrice = entry ? num(entry.row, mapping.price) ?? num(entry.row, mapping.entryPrice) : null;
    const exitPrice = num(exit.row, mapping.price) ?? num(exit.row, mapping.exitPrice);

    const netFromRow = num(exit.row, mapping.netPnl) ?? num(entry?.row ?? [], mapping.netPnl);
    const grossFromRow = num(exit.row, mapping.grossPnl);
    const fees = feesOf(exit.row, mapping) + (entry ? feesOf(entry.row, mapping) : 0);

    let netPnl = netFromRow;
    if (netPnl === null && grossFromRow !== null) netPnl = grossFromRow - fees;
    if (netPnl === null && entryPrice !== null && exitPrice !== null && quantity) {
      netPnl = (exitPrice - entryPrice) * quantity * (side === "long" ? 1 : -1) - fees;
    }
    if (netPnl === null) {
      skipped += list.length;
      continue;
    }

    const symbol = (cell(exit.row, mapping.symbol) || cell(entry?.row ?? [], mapping.symbol) || "—").toUpperCase();

    trades.push({
      dedupeKey: hashKey(["paired", symbol, side, round(quantity), round(entryPrice ?? 0), round(exitPrice ?? 0), opened?.iso ?? "", closed.iso, round(netPnl, 4), key]),
      symbol,
      side,
      quantity,
      entryPrice,
      exitPrice,
      stopPrice: num(exit.row, mapping.stopPrice),
      openedAt: opened?.iso ?? null,
      closedAt: closed.iso,
      closeDate: closed.date,
      grossPnl: round(netPnl + fees, 4),
      fees: round(fees, 4),
      netPnl: round(netPnl, 4),
      note: cell(exit.row, mapping.note) || cell(entry?.row ?? [], mapping.note),
      raw: { ...rawOf(table.headers, entry?.row ?? []), ...rawOf(table.headers, exit.row) },
    });
  }

  const openLegs = [...groups.values()].filter((l) => !l.some((x) => x.kind === "exit")).length;
  if (openLegs) warnings.push(`${openLegs} entry row(s) had no matching exit and were left out (still open).`);
  return { trades, skipped, warnings, openPositions: openLegs };
}

function normalizeFills(table: Table, mapping: Mapping, dayFirst: boolean) {
  const trades: NormalizedTrade[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  type Fill = {
    symbol: string;
    side: "long" | "short";
    qty: number;
    price: number;
    iso: string;
    date: string;
    fee: number;
    id: string;
    row: string[];
    index: number;
  };

  const fills: Fill[] = [];
  table.rows.forEach((row, index) => {
    const status = cell(row, mapping.status);
    if (status && DEAD_STATUS.test(status) && !/filled|closed|done|executed/i.test(status)) {
      skipped++;
      return;
    }
    const side = readSide(row, mapping);
    const qty = Math.abs(num(row, mapping.quantity) ?? 0);
    const price = num(row, mapping.price) ?? num(row, mapping.exitPrice) ?? num(row, mapping.entryPrice);
    const when = pickTime(row, mapping, dayFirst, ["closeTime", "time", "openTime"]);
    if (!side || !qty || price === null || !when) {
      skipped++;
      return;
    }
    fills.push({
      symbol: (cell(row, mapping.symbol) || "—").toUpperCase(),
      side,
      qty,
      price,
      iso: when.iso,
      date: when.date,
      fee: feesOf(row, mapping),
      id: cell(row, mapping.orderId) || cell(row, mapping.tradeId),
      row,
      index,
    });
  });

  fills.sort((a, b) => (a.iso === b.iso ? a.index - b.index : a.iso < b.iso ? -1 : 1));

  type Lot = { side: "long" | "short"; qty: number; price: number; iso: string; fee: number; id: string; row: string[] };
  const books = new Map<string, Lot[]>();

  for (const fill of fills) {
    const book = books.get(fill.symbol) ?? [];
    let remaining = fill.qty;
    let remainingFee = fill.fee;

    while (remaining > 1e-12 && book.length && book[0].side !== fill.side) {
      const lot = book[0];
      const matched = Math.min(remaining, lot.qty);
      const direction = lot.side === "long" ? 1 : -1;
      const gross = (fill.price - lot.price) * matched * direction;

      const entryFeeShare = lot.qty > 0 ? (lot.fee * matched) / lot.qty : 0;
      const exitFeeShare = fill.qty > 0 ? (remainingFee * matched) / Math.max(remaining, 1e-12) : 0;
      const fees = entryFeeShare + exitFeeShare;

      trades.push({
        dedupeKey:
          fill.id || lot.id
            ? `fifo:${fill.symbol}:${lot.id || lot.iso}:${fill.id || fill.iso}:${round(matched)}`
            : hashKey(["fifo", fill.symbol, lot.side, round(matched), round(lot.price), round(fill.price), lot.iso, fill.iso]),
        symbol: fill.symbol,
        side: lot.side,
        quantity: round(matched),
        entryPrice: lot.price,
        exitPrice: fill.price,
        stopPrice: null,
        openedAt: lot.iso,
        closedAt: fill.iso,
        closeDate: fill.date,
        grossPnl: round(gross, 4),
        fees: round(fees, 4),
        netPnl: round(gross - fees, 4),
        note: "",
        raw: { ...rawOf(table.headers, lot.row), ...rawOf(table.headers, fill.row) },
      });

      lot.fee -= entryFeeShare;
      remainingFee -= exitFeeShare;
      lot.qty -= matched;
      remaining -= matched;
      if (lot.qty <= 1e-12) book.shift();
    }

    if (remaining > 1e-12) {
      book.push({
        side: fill.side,
        qty: remaining,
        price: fill.price,
        iso: fill.iso,
        fee: remainingFee,
        id: fill.id,
        row: fill.row,
      });
    }
    books.set(fill.symbol, book);
  }

  const openPositions = [...books.values()].reduce((n, book) => n + book.length, 0);
  if (openPositions) {
    warnings.push(`${openPositions} position(s) are still open and were not counted as realized P&L.`);
  }
  if (trades.length) {
    warnings.push("P&L was derived from fill prices × quantity. If your export has a P&L column, import that file instead for exact figures.");
  }
  return { trades, skipped, warnings, openPositions };
}

function normalizeBalance(table: Table, mapping: Mapping, dayFirst: boolean) {
  const events: NormalizedBalanceEvent[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  let previousBalance: number | null = null;
  for (const row of table.rows) {
    const when = pickTime(row, mapping, dayFirst, ["time", "closeTime", "openTime"]);
    if (!when) {
      skipped++;
      continue;
    }
    const balance = num(row, mapping.balance);
    let amount = num(row, mapping.amount) ?? num(row, mapping.netPnl);
    if (amount === null && balance !== null && previousBalance !== null) {
      amount = balance - previousBalance;
    }
    if (balance !== null) previousBalance = balance;
    if (amount === null) {
      skipped++;
      continue;
    }

    const label = cell(row, mapping.type) || cell(row, mapping.note) || cell(row, mapping.side);
    let kind = balanceKindFromValue(label);
    if (kind === "unknown") kind = amount >= 0 ? "deposit" : "withdrawal";
    if (kind === "deposit" && amount < 0) kind = "withdrawal";

    const id = cell(row, mapping.orderId) || cell(row, mapping.tradeId);
    events.push({
      dedupeKey: id
        ? `id:${id}`
        : hashKey(["bal", kind, round(amount, 4), when.iso, round(balance ?? 0, 4)]),
      kind,
      amount: round(amount, 4),
      balance,
      occurredAt: when.iso,
      eventDate: when.date,
      note: cell(row, mapping.note) || label,
      raw: rawOf(table.headers, row),
    });
  }
  return { events, skipped, warnings, openPositions: 0 };
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export function analyze(
  table: Table,
  options: {
    dataset?: Dataset;
    mode?: TradeMode;
    override?: Partial<Record<Field, string>>;
    dayFirst?: boolean;
    symbol?: string;
  } = {},
): Analysis {
  const mapping = buildMapping(table.headers, options.override);

  const dateColumn =
    mapping.closeTime ?? mapping.time ?? mapping.openTime;
  const dayFirst =
    options.dayFirst ?? detectDayFirst(sample(table, dateColumn, 200));

  const dataset = options.dataset ?? detectDataset(table, mapping);
  const mode = dataset === "trades" ? options.mode ?? detectMode(table, mapping) : "closed";

  const result =
    dataset === "balance"
      ? { ...normalizeBalance(table, mapping, dayFirst), trades: [] as NormalizedTrade[] }
      : mode === "closed"
        ? { ...normalizeClosed(table, mapping, dayFirst), events: [] as NormalizedBalanceEvent[] }
        : mode === "paired"
          ? { ...normalizePaired(table, mapping, dayFirst), events: [] as NormalizedBalanceEvent[] }
          : { ...normalizeFills(table, mapping, dayFirst), events: [] as NormalizedBalanceEvent[] };

  // Exports without a symbol column (Strategy Tester) can be labelled at
  // import time; the label is part of the key so two instruments never merge.
  const symbolOverride = options.symbol?.trim().toUpperCase().slice(0, 40);
  if (symbolOverride) {
    for (const trade of result.trades) {
      if (trade.symbol === "—") {
        trade.symbol = symbolOverride;
        trade.dedupeKey = `${symbolOverride}|${trade.dedupeKey}`;
      }
    }
  }

  // Never let one file insert the same row twice.
  const seen = new Set<string>();
  const trades = result.trades.filter((t) => (seen.has(t.dedupeKey) ? false : (seen.add(t.dedupeKey), true)));
  const events = result.events.filter((e) => (seen.has(e.dedupeKey) ? false : (seen.add(e.dedupeKey), true)));

  const mapped = (Object.entries(mapping) as [Field, number][])
    .sort((a, b) => a[1] - b[1])
    .map(([field, idx]) => ({ field, header: table.headers[idx] }));
  const usedIdx = new Set(Object.values(mapping));

  return {
    dataset,
    mode,
    mapping,
    headers: table.headers,
    mappedColumns: mapped,
    unmappedColumns: table.headers.filter((_, i) => !usedIdx.has(i)),
    rowsRead: table.rows.length,
    dayFirst,
    trades,
    events,
    skipped: result.skipped,
    openPositions: result.openPositions,
    warnings: result.warnings,
  };
}
