export function currency(value: number, ccy = "USD", opts: { sign?: boolean; compact?: boolean } = {}): string {
  const { sign = false, compact = false } = opts;
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: ccy || "USD",
    minimumFractionDigits: compact && abs >= 10000 ? 0 : 2,
    maximumFractionDigits: compact && abs >= 10000 ? 0 : 2,
    notation: compact && abs >= 1_000_000 ? "compact" : "standard",
  }).format(abs);
  const prefix = value < 0 ? "-" : sign && value > 0 ? "+" : "";
  return `${prefix}${formatted}`;
}

export function money(value: number, ccy = "USD"): string {
  return currency(value, ccy, { sign: true });
}

export function percent(value: number | null, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function rValue(value: number | null, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}R`;
}

export function number(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "∞";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Formats a YYYY-MM-DD key without ever crossing a timezone boundary. */
export function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

export function compactDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function timeOfDay(iso: string | null): string {
  if (!iso || !iso.includes("T")) return "—";
  return iso.slice(11, 16);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
