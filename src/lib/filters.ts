import { EMPTY_FILTERS, type Filters } from "./types";

type SP = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(sp: SP): Filters {
  const from = first(sp.from);
  const to = first(sp.to);
  const result = first(sp.result);
  return {
    ...EMPTY_FILTERS,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    symbols: list(sp.symbols),
    sides: list(sp.side).filter((s): s is "long" | "short" => s === "long" || s === "short"),
    tags: list(sp.tags),
    result: result === "wins" || result === "losses" ? result : "all",
    search: first(sp.q) || undefined,
  };
}

export function activeFilterCount(filters: Filters): number {
  let n = 0;
  if (filters.from) n++;
  if (filters.to) n++;
  if (filters.symbols.length) n++;
  if (filters.sides.length) n++;
  if (filters.tags.length) n++;
  if (filters.result !== "all") n++;
  if (filters.search) n++;
  return n;
}
