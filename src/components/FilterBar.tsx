"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { IconClose, IconFilter, IconSearch } from "@/components/Icons";

export default function FilterBar({ symbols, tags }: { symbols: string[]; tags: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const get = (key: string) => params.get(key) ?? "";
  const selectedSymbols = get("symbols").split(",").filter(Boolean);
  const selectedTags = get("tags").split(",").filter(Boolean);

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) sp.delete(key);
      else sp.set(key, value);
    }
    router.push(`?${sp.toString()}`, { scroll: false });
  }

  function toggle(key: string, value: string) {
    const current = get(key).split(",").filter(Boolean);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update({ [key]: next.join(",") || null });
  }

  const count = ["from", "to", "symbols", "side", "tags", "result", "q"].filter((k) => get(k)).length;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        <button className="btn" onClick={() => setOpen((v) => !v)}>
          <IconFilter width={15} height={15} />
          Filters
          {count > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-canvas">
              {count}
            </span>
          )}
        </button>

        <div className="relative min-w-[180px] flex-1">
          <IconSearch
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            className="input h-9 pl-9"
            placeholder="Search symbol, tag or note…"
            defaultValue={get("q")}
            onKeyDown={(e) => {
              if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value || null });
            }}
            onBlur={(e) => update({ q: e.target.value || null })}
          />
        </div>

        <div className="segment">
          {[
            ["all", "All"],
            ["wins", "Wins"],
            ["losses", "Losses"],
          ].map(([value, label]) => (
            <button
              key={value}
              data-active={(get("result") || "all") === value}
              onClick={() => update({ result: value === "all" ? null : value })}
            >
              {label}
            </button>
          ))}
        </div>

        {count > 0 && (
          <button
            className="btn btn-ghost"
            onClick={() => router.push("?", { scroll: false })}
            title="Clear filters"
          >
            <IconClose width={15} height={15} /> Clear
          </button>
        )}
      </div>

      {open && (
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">From</span>
            <input
              type="date"
              className="input mt-1.5 h-9"
              defaultValue={get("from")}
              onChange={(e) => update({ from: e.target.value || null })}
            />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input
              type="date"
              className="input mt-1.5 h-9"
              defaultValue={get("to")}
              onChange={(e) => update({ to: e.target.value || null })}
            />
          </label>

          <div>
            <span className="label">Side</span>
            <div className="mt-1.5 flex gap-2">
              {["long", "short"].map((side) => {
                const active = get("side").split(",").includes(side);
                return (
                  <button
                    key={side}
                    className={`chip h-9 flex-1 justify-center ${active ? "border-brand text-brand" : ""}`}
                    onClick={() => toggle("side", side)}
                  >
                    {side === "long" ? "Long" : "Short"}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="label">Quick range</span>
            <div className="mt-1.5 flex gap-2">
              {[
                ["30", "30d"],
                ["90", "90d"],
                ["365", "1y"],
              ].map(([days, label]) => (
                <button
                  key={days}
                  className="chip h-9 flex-1 justify-center"
                  onClick={() => {
                    const to = new Date();
                    const from = new Date(Date.now() - Number(days) * 864e5);
                    update({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {symbols.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <span className="label">Symbols</span>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {symbols.map((symbol) => {
                  const active = selectedSymbols.includes(symbol);
                  return (
                    <button
                      key={symbol}
                      className={`chip ${active ? "border-brand text-brand" : ""}`}
                      onClick={() => toggle("symbols", symbol)}
                    >
                      {symbol}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <span className="label">Tags</span>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {tags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`chip ${active ? "border-brand text-brand" : ""}`}
                      onClick={() => toggle("tags", tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
