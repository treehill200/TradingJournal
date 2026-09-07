/* Small, dependency-free CSV toolkit: RFC4180-ish parsing plus the loose
   number/date handling real broker exports need. */

export type Table = { headers: string[]; rows: string[][]; delimiter: string };

const DELIMITERS = [",", ";", "\t", "|"];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sniffDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  let best = ",";
  let bestScore = -1;
  for (const d of DELIMITERS) {
    // Count only separators outside quotes.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === d) count++;
    }
    if (count > bestScore) {
      bestScore = count;
      best = d;
    }
  }
  return best;
}

/** Parses CSV/TSV text into rows of raw strings. */
export function parseDelimited(input: string, delimiter?: string): Table {
  const text = stripBom(input).replace(/\r\n?/g, "\n");
  const d = delimiter || sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);

  const cleaned = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));

  if (!cleaned.length) return { headers: [], rows: [], delimiter: d };

  // Some exports prefix a title/among-blank line before the real header. The
  // header is the first row whose cell count matches the widest row.
  const widest = Math.max(...cleaned.map((r) => r.length));
  let headerIdx = cleaned.findIndex((r) => r.length === widest && r.filter(Boolean).length >= 2);
  if (headerIdx < 0) headerIdx = 0;

  const headers = cleaned[headerIdx].map((h, i) => h || `column_${i + 1}`);
  const body = cleaned.slice(headerIdx + 1).map((r) => {
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  });

  return { headers, rows: body, delimiter: d };
}

const CURRENCY_TOKENS = new Set([
  "usd", "eur", "gbp", "jpy", "aud", "cad", "chf", "nzd", "inr", "brl", "zar",
  "sek", "nok", "dkk", "hkd", "sgd", "mxn", "pln", "try", "cny", "usdt", "usdc",
]);

/**
 * Header text -> comparable key.
 *
 * Two details matter for real exports: a "%" column must never look like a
 * money column ("Profit %" and "Profit USD" are different things), and a
 * trailing currency code is noise ("Profit USD" is just profit).
 */
export function normalizeHeader(header: string): string {
  const tokens = header
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/%/g, " pct ")
    .replace(/#/g, " num ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length > 1 && CURRENCY_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("_");
}

/* ------------------------------------------------------------------ */
/* numbers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parses numbers the way brokers write them: "1,234.56", "1.234,56",
 * "(1,234.56)" for negatives, "−12" with a unicode minus, "$1,200", "12.5%",
 * "1 234,56", "12.5K".
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (!s || s === "-" || s === "—" || s === "n/a" || s.toLowerCase() === "null") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[−–—]/g, "-");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);

  let multiplier = 1;
  const suffix = s.match(/([kmb])\s*$/i);
  if (suffix) {
    multiplier = { k: 1e3, m: 1e6, b: 1e9 }[suffix[1].toLowerCase() as "k" | "m" | "b"];
    s = s.slice(0, -suffix[0].length);
  }

  // Drop currency symbols, spaces, letters (USD, EUR, %, etc.).
  s = s.replace(/[^0-9.,']/g, "").replace(/'/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    // "1,234" is a thousands group; "1,23" is a decimal.
    s = decimals === 3 && s.replace(/,/g, "").length > 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return (negative ? -value : value) * multiplier;
}

/* ------------------------------------------------------------------ */
/* dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * Parses a broker timestamp into a *floating* ISO string (no timezone shift).
 * Trading days are the broker's days: re-interpreting them in the viewer's
 * local zone is what makes journals show trades on the wrong date, so the
 * wall-clock time in the file is kept exactly as written.
 */
export function parseDateTime(
  input: string | number | null | undefined,
  opts: { dayFirst?: boolean } = {},
): { iso: string; date: string; time: string } | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Epoch seconds / milliseconds.
  if (/^\d{10}$/.test(s) || /^\d{13}$/.test(s)) {
    const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return fromParts(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
    );
  }

  s = s.replace(/^[a-z]{3},?\s+/i, ""); // leading weekday
  const trailingTz = /\s*(?:UTC|GMT|Z)\s*(?:[+-]\d{1,2}:?\d{2})?$/i;
  s = s.replace(trailingTz, "").trim();
  s = s.replace(/\s*[+-]\d{2}:\d{2}$/, "").trim(); // explicit offset

  let ampm: "am" | "pm" | null = null;
  const ap = s.match(/\s*([ap])\.?m\.?$/i);
  if (ap) {
    ampm = ap[1].toLowerCase() === "a" ? "am" : "pm";
    s = s.slice(0, -ap[0].length).trim();
  }

  const [datePart = "", timePartRaw = ""] = s.split(/[T\s]+/, 2).length > 1
    ? [s.split(/[T\s]+/)[0], s.split(/[T\s]+/).slice(1).join(" ")]
    : [s, ""];

  let hh = 0, mm = 0, ss = 0;
  const timeMatch = timePartRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    hh = Number(timeMatch[1]);
    mm = Number(timeMatch[2]);
    ss = Number(timeMatch[3] ?? 0);
    if (ampm === "pm" && hh < 12) hh += 12;
    if (ampm === "am" && hh === 12) hh = 0;
  }

  // 2024-05-13
  let m = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return fromParts(+m[1], +m[2], +m[3], hh, mm, ss);

  // 20240513
  m = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return fromParts(+m[1], +m[2], +m[3], hh, mm, ss);

  // 13/05/2024 or 05/13/2024 (and 2-digit years)
  m = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let day: number, month: number;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { month = a; day = b; }
    else if (opts.dayFirst) { day = a; month = b; }
    else { month = a; day = b; }
    return fromParts(year, month, day, hh, mm, ss);
  }

  // 13 May 2024 / May 13, 2024 / 13-May-24
  m = datePart.match(/^(\d{1,2})[-\s]([a-z]{3,})[-\s](\d{2,4})$/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return fromParts(year, MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], hh, mm, ss);
  }
  m = s.match(/^([a-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    return fromParts(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], hh, mm, ss);
  }

  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) {
    return fromParts(
      fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate(),
      fallback.getHours(), fallback.getMinutes(), fallback.getSeconds(),
    );
  }
  return null;
}

function fromParts(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  const date = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  const time = `${pad(h)}:${pad(mi)}:${pad(s)}`;
  return { iso: `${date}T${time}`, date, time };
}

/** True when a column of dd/mm vs mm/dd values is unambiguously day-first. */
export function detectDayFirst(values: string[]): boolean {
  for (const v of values) {
    const m = String(v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (+m[1] > 12) return true;
    if (+m[2] > 12) return false;
  }
  return false;
}

/**
 * True when every numeric date in the column could be read either way —
 * "04/09/2026" is 4 September or 9 April and the file cannot tell you which.
 */
export function datesAreAmbiguous(values: string[]): string | null {
  let candidate: string | null = null;
  for (const v of values) {
    const raw = String(v).trim();
    const m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (+m[1] > 12 || +m[2] > 12) return null; // something in the column settles it
    if (+m[1] !== +m[2] && !candidate) candidate = m[0];
  }
  return candidate;
}

/* ------------------------------------------------------------------ */
/* writing                                                             */
/* ------------------------------------------------------------------ */

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";
}
