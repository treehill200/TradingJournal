import { redirect } from "next/navigation";
import { getUser } from "./auth";
import { activeAccountId } from "./active-account";
import { loadWorkspace } from "./store";
import { parseFilters } from "./filters";
import {
  accountBalance, applyFilters, buildDayRollups, buildEquityCurve, filterDayEntries, summarize,
  type DayRollup, type EquityPoint, type Summary,
} from "./metrics";
import type { Account, BalanceEvent, DayNote, Filters, Trade } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;

export type JournalView = {
  user: { id: string; email: string; name: string };
  account: Account;
  accounts: Account[];
  filters: Filters;
  /** Query string of the active filters, for building links that keep them. */
  query: string;
  /** Every trade in the account, unfiltered — for the balance and filter options. */
  allTrades: Trade[];
  trades: Trade[];
  events: BalanceEvent[];
  notes: DayNote[];
  /** Day rollups with real activity, oldest first. Note-only days are excluded. */
  days: DayRollup[];
  dayMap: Record<string, DayRollup>;
  summary: Summary;
  curve: EquityPoint[];
  balance: number;
  symbols: string[];
  tags: string[];
  ccy: string;
};

/**
 * The one place the dashboard, calendar, statistics and reports pages get their
 * data. Having four copies of this pipeline is how a bug in it came to need
 * fixing in five files at once.
 */
export async function loadJournalView(searchParams: Promise<SearchParams>): Promise<JournalView> {
  const user = await getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { account, accounts, trades, events, dayEntries, notes } = await loadWorkspace(
    user.id,
    await activeAccountId(),
  );

  const filtered = applyFilters(trades, filters);
  const rollups = buildDayRollups(filtered, account, filterDayEntries(dayEntries, filters), notes);
  const days = [...rollups.values()]
    .filter((day) => day.activity)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value] as [string, string]],
    ),
  ).toString();

  return {
    user: { id: user.id, email: user.email, name: user.name },
    account,
    accounts,
    filters,
    query,
    allTrades: trades,
    trades: filtered,
    events,
    notes,
    days,
    // The calendar needs note-only days too, so it can still show their marker.
    dayMap: Object.fromEntries(rollups),
    summary: summarize(filtered, account, days),
    curve: buildEquityCurve(account, days, events),
    balance: accountBalance(account, trades, dayEntries, events),
    symbols: [...new Set(trades.map((t) => t.symbol))].sort(),
    tags: [
      ...new Set(trades.flatMap((t) => t.tags.split(",").map((x) => x.trim()).filter(Boolean))),
    ].sort(),
    ccy: account.currency,
  };
}
