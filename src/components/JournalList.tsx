"use client";

import { useMemo, useState } from "react";
import DayPanel from "@/components/DayPanel";
import { IconPlus, IconSearch } from "@/components/Icons";
import { currency, longDate, percent } from "@/lib/format";
import { todayKey } from "@/lib/metrics";

export type JournalRow = {
  date: string;
  title: string;
  body: string;
  mood: string;
  rating: number | null;
  tags: string;
  netPnl: number;
  trades: number;
  winRate: number | null;
};

export default function JournalList({ rows, ccy }: { rows: JournalRow[]; ccy: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "written" | "missing">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const written = Boolean(row.title || row.body || row.rating);
      if (only === "written" && !written) return false;
      if (only === "missing" && written) return false;
      if (!q) return true;
      return `${row.date} ${row.title} ${row.body} ${row.tags} ${row.mood}`.toLowerCase().includes(q);
    });
  }, [rows, query, only]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input h-9 pl-9"
            placeholder="Search your notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segment">
          {([
            ["all", "All days"],
            ["written", "Journaled"],
            ["missing", "Not journaled"],
          ] as const).map(([value, label]) => (
            <button key={value} data-active={only === value} onClick={() => setOnly(value)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setSelected(todayKey())}>
          <IconPlus width={15} height={15} /> Today&apos;s entry
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-[14px] font-semibold">Nothing here yet</p>
          <p className="mt-2 text-[13px] text-muted">
            Journal entries you write on a trading day show up here, newest first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const written = Boolean(row.title || row.body || row.rating);
            return (
              <button
                key={row.date}
                onClick={() => setSelected(row.date)}
                className="card card-hover block w-full p-4 text-left"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{longDate(row.date)}</span>
                      {row.mood && <span className="chip h-5 px-2 text-[10px]">{row.mood}</span>}
                      {row.rating && (
                        <span className="text-[11px] text-warn">{"★".repeat(row.rating)}</span>
                      )}
                      {!written && <span className="chip h-5 px-2 text-[10px] text-faint">no entry</span>}
                    </div>
                    {row.title && <div className="mt-1.5 text-[13.5px] text-ink">{row.title}</div>}
                    {row.body && (
                      <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed whitespace-pre-line text-muted">
                        {row.body}
                      </p>
                    )}
                    {row.tags && <div className="mt-2 text-[11px] text-brand">{row.tags}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`num text-[15px] font-semibold ${row.netPnl > 0 ? "text-profit" : row.netPnl < 0 ? "text-loss" : "text-muted"}`}>
                      {currency(row.netPnl, ccy, { sign: true })}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      {row.trades} trades · {percent(row.winRate, 0)} win
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <DayPanel date={selected} ccy={ccy} onClose={() => setSelected(null)} />}
    </div>
  );
}
