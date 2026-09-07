import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  datesAreAmbiguous, detectDayFirst, normalizeHeader, parseDateTime, parseDelimited,
  parseNumber, toCsv,
} from "../src/lib/csv";

describe("parseDelimited", () => {
  it("reads a plain comma file", () => {
    const t = parseDelimited("a,b\n1,2\n3,4\n");
    assert.deepEqual(t.headers, ["a", "b"]);
    assert.deepEqual(t.rows, [["1", "2"], ["3", "4"]]);
  });

  it("sniffs semicolons and tabs", () => {
    assert.equal(parseDelimited("a;b\n1;2\n").delimiter, ";");
    assert.equal(parseDelimited("a\tb\n1\t2\n").delimiter, "\t");
  });

  it("honours quotes, embedded delimiters and escaped quotes", () => {
    const t = parseDelimited('a,b\n"one, two","he said ""hi"""\n');
    assert.deepEqual(t.rows[0], ["one, two", 'he said "hi"']);
  });

  it("strips a BOM and normalises CRLF", () => {
    const t = parseDelimited('﻿a,b\r\n1,2\r\n');
    assert.deepEqual(t.headers, ["a", "b"]);
    assert.deepEqual(t.rows, [["1", "2"]]);
  });

  it("skips a title row and blank lines before the real header", () => {
    const t = parseDelimited("My Broker Report\n\nSymbol,Side,Qty\nAAPL,Buy,10\n");
    assert.deepEqual(t.headers, ["Symbol", "Side", "Qty"]);
    assert.deepEqual(t.rows, [["AAPL", "Buy", "10"]]);
  });

  it("pads short rows so column indexes stay aligned", () => {
    const t = parseDelimited("a,b,c\n1,2\n");
    assert.deepEqual(t.rows[0], ["1", "2", ""]);
  });
});

describe("normalizeHeader", () => {
  it("lowercases and underscores", () => {
    assert.equal(normalizeHeader("Close Time"), "close_time");
    assert.equal(normalizeHeader("Net P&L"), "net_p_l");
  });

  it("keeps percent columns distinct from money columns", () => {
    assert.equal(normalizeHeader("Profit %"), "profit_pct");
    assert.notEqual(normalizeHeader("Profit %"), normalizeHeader("Profit USD"));
  });

  it("drops a trailing currency code", () => {
    assert.equal(normalizeHeader("Profit USD"), "profit");
    assert.equal(normalizeHeader("Price USD"), "price");
  });

  it("does not strip a currency that is the whole header", () => {
    assert.equal(normalizeHeader("USD"), "usd");
  });

  it("turns # into a word", () => {
    assert.equal(normalizeHeader("Trade #"), "trade_num");
  });
});

describe("parseNumber", () => {
  it("reads plain and thousands-grouped numbers", () => {
    assert.equal(parseNumber("1234.56"), 1234.56);
    assert.equal(parseNumber("1,234.56"), 1234.56);
    assert.equal(parseNumber("$1,200"), 1200);
  });

  it("reads European decimals", () => {
    assert.equal(parseNumber("1.234,56"), 1234.56);
    assert.equal(parseNumber("1,5"), 1.5);
  });

  it("reads negatives in every dialect", () => {
    assert.equal(parseNumber("(1,234.56)"), -1234.56);
    assert.equal(parseNumber("−12"), -12);
    assert.equal(parseNumber("-0.5"), -0.5);
  });

  it("ignores currency words and suffixes", () => {
    assert.equal(parseNumber("12.5%"), 12.5);
    assert.equal(parseNumber("1.2K"), 1200);
    assert.equal(parseNumber("500 USD"), 500);
  });

  it("returns null for blanks and placeholders", () => {
    for (const v of ["", "  ", "-", "—", "n/a", null, undefined]) {
      assert.equal(parseNumber(v as string), null, `expected null for ${JSON.stringify(v)}`);
    }
  });
});

describe("parseDateTime", () => {
  it("reads ISO with and without a zone marker", () => {
    assert.equal(parseDateTime("2026-09-14T18:20:00Z")?.date, "2026-09-14");
    assert.equal(parseDateTime("2026-09-14 18:20:00")?.iso, "2026-09-14T18:20:00");
  });

  it("never shifts the wall-clock day into another timezone", () => {
    // 23:30 must stay on the 14th no matter where the server is.
    assert.equal(parseDateTime("2026-09-14T23:30:00Z")?.date, "2026-09-14");
    assert.equal(parseDateTime("2026-09-14 00:15:00")?.date, "2026-09-14");
  });

  it("respects the day-first hint only when it is ambiguous", () => {
    assert.equal(parseDateTime("04/09/2026")?.date, "2026-04-09");
    assert.equal(parseDateTime("04/09/2026", { dayFirst: true })?.date, "2026-09-04");
    // 13 cannot be a month, so the hint is irrelevant here
    assert.equal(parseDateTime("13/09/2026")?.date, "2026-09-13");
  });

  it("reads written months, 2-digit years and 12-hour clocks", () => {
    assert.equal(parseDateTime("13 May 2024")?.date, "2024-05-13");
    assert.equal(parseDateTime("May 13, 2024 14:32")?.iso, "2024-05-13T14:32:00");
    assert.equal(parseDateTime("13-May-24")?.date, "2024-05-13");
    assert.equal(parseDateTime("2026-09-14 01:05 PM")?.iso, "2026-09-14T13:05:00");
    assert.equal(parseDateTime("2026-09-14 12:05 AM")?.iso, "2026-09-14T00:05:00");
  });

  it("reads compact and epoch forms", () => {
    assert.equal(parseDateTime("20240513")?.date, "2024-05-13");
    assert.equal(parseDateTime("1715600000")?.date.slice(0, 4), "2024");
  });

  it("returns null for junk", () => {
    assert.equal(parseDateTime("not a date"), null);
    assert.equal(parseDateTime(""), null);
  });
});

describe("date ambiguity", () => {
  it("detects day-first when a day exceeds 12", () => {
    assert.equal(detectDayFirst(["04/09/2026", "13/09/2026"]), true);
    assert.equal(detectDayFirst(["09/13/2026"]), false);
  });

  it("flags a column that could be read either way", () => {
    assert.equal(datesAreAmbiguous(["04/09/2026", "05/09/2026"]), "04/09/2026");
  });

  it("stays quiet once any row settles the format", () => {
    assert.equal(datesAreAmbiguous(["04/09/2026", "22/09/2026"]), null);
    assert.equal(datesAreAmbiguous(["2026-09-04"]), null);
  });
});

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    assert.equal(toCsv(["a", "b"], [["plain", 'has "quote", comma']]),
      'a,b\nplain,"has ""quote"", comma"\n');
  });

  it("writes empty cells for null and undefined", () => {
    assert.equal(toCsv(["a", "b"], [[null, undefined]]), "a,b\n,\n");
  });
});
