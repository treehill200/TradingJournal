"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconClose, IconPlus, IconTrash } from "@/components/Icons";
import { currency, longDate, percent, timeOfDay } from "@/lib/format";
import type { DayEntry, DayNote, Trade } from "@/lib/types";

type DayData = {
  date: string;
  trades: Trade[];
  note: DayNote | null;
  entry: DayEntry | null;
  totals: { netPnl: number; fees: number; wins: number; losses: number; winRate: number | null; rMultiple: number | null };
};

const MOODS = ["", "Calm", "Focused", "Confident", "Anxious", "Impatient", "Frustrated", "Tilted"];

export default function DayPanel({
  date,
  ccy,
  onClose,
}: {
  date: string;
  ccy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<DayData | null>(null);
  const [tab, setTab] = useState<"trades" | "journal" | "manual">("trades");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/days?date=${date}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Could not save.");
        return false;
      }
      await load();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const totals = data?.totals;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[560px] flex-col border-l border-line bg-surface animate-slide-in">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight">{longDate(date)}</div>
            {totals && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
                <span className={totals.netPnl > 0 ? "text-profit" : totals.netPnl < 0 ? "text-loss" : ""}>
                  {currency(totals.netPnl, ccy, { sign: true })}
                </span>
                <span>
                  {data!.trades.length} trade{data!.trades.length === 1 ? "" : "s"}
                </span>
                <span>{percent(totals.winRate, 0)} win</span>
                {totals.rMultiple !== null && (
                  <span>
                    {totals.rMultiple > 0 ? "+" : ""}
                    {totals.rMultiple.toFixed(2)}R
                  </span>
                )}
                {totals.fees > 0 && <span>{currency(totals.fees, ccy)} fees</span>}
              </div>
            )}
          </div>
          <button className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <IconClose width={17} height={17} />
          </button>
        </header>

        <div className="border-b border-line px-5 py-2.5">
          <div className="segment">
            {(["trades", "journal", "manual"] as const).map((t) => (
              <button key={t} data-active={tab === t} onClick={() => setTab(t)}>
                {t === "trades" ? "Trades" : t === "journal" ? "Journal" : "Quick entry"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-[12.5px] text-loss">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </div>
          ) : tab === "trades" ? (
            <TradesTab data={data} ccy={ccy} busy={busy} send={send} date={date} />
          ) : tab === "journal" ? (
            <JournalTab data={data} busy={busy} send={send} date={date} />
          ) : (
            <ManualTab data={data} busy={busy} send={send} date={date} ccy={ccy} />
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TradesTab({
  data,
  ccy,
  busy,
  send,
  date,
}: {
  data: DayData;
  ccy: string;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
  date: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {data.trades.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-[13px] text-muted">No individual trades recorded for this day.</p>
          <p className="mt-1 text-[12px] text-faint">
            Import a TradingView CSV, add a trade, or log day totals under “Quick entry”.
          </p>
        </div>
      )}

      {data.trades.map((trade) => (
        <div key={trade.id} className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold">{trade.symbol}</span>
                <span
                  className={`chip h-5 px-1.5 text-[10px] ${
                    trade.side === "long" ? "text-profit" : "text-loss"
                  }`}
                >
                  {trade.side.toUpperCase()}
                </span>
                {trade.source !== "manual" && <span className="chip h-5 px-1.5 text-[10px]">CSV</span>}
              </div>
              <div className="num mt-1 text-[11.5px] text-faint">
                {trade.quantity} @ {trade.entry_price ?? "—"} → {trade.exit_price ?? "—"} ·{" "}
                {timeOfDay(trade.opened_at)}–{timeOfDay(trade.closed_at)}
              </div>
              {trade.tags && <div className="mt-1.5 text-[11px] text-brand">{trade.tags}</div>}
              {trade.notes && <div className="mt-1 text-[12px] text-muted">{trade.notes}</div>}
            </div>
            <div className="text-right">
              <div
                className={`num text-[14px] font-semibold ${trade.net_pnl >= 0 ? "text-profit" : "text-loss"}`}
              >
                {currency(trade.net_pnl, ccy, { sign: true })}
              </div>
              {trade.fees > 0 && (
                <div className="num mt-0.5 text-[11px] text-faint">{currency(trade.fees, ccy)} fees</div>
              )}
              <button
                className="btn-ghost mt-1.5 grid h-7 w-7 place-items-center rounded-md text-faint hover:text-loss"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete this ${trade.symbol} trade? This cannot be undone.`)) {
                    send(`/api/trades/${trade.id}`, "DELETE");
                  }
                }}
                aria-label="Delete trade"
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          </div>
        </div>
      ))}

      {adding ? (
        <AddTradeForm
          date={date}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={async (payload) => {
            if (await send("/api/trades", "POST", payload)) setAdding(false);
          }}
        />
      ) : (
        <button className="btn w-full" onClick={() => setAdding(true)}>
          <IconPlus width={15} height={15} /> Add a trade
        </button>
      )}
    </div>
  );
}

function AddTradeForm({
  date,
  busy,
  onCancel,
  onSubmit,
}: {
  date: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="space-y-3 rounded-xl border border-line bg-surface-2 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onSubmit({
          closeDate: date,
          symbol: form.get("symbol"),
          side: form.get("side"),
          quantity: form.get("quantity"),
          entryPrice: form.get("entryPrice"),
          exitPrice: form.get("exitPrice"),
          stopPrice: form.get("stopPrice"),
          netPnl: form.get("netPnl"),
          fees: form.get("fees"),
          closedTime: form.get("closedTime"),
          tags: form.get("tags"),
          notes: form.get("notes"),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Symbol">
          <input name="symbol" className="input" placeholder="ES1!" required maxLength={40} />
        </Labeled>
        <Labeled label="Side">
          <select name="side" className="input" defaultValue="long">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </Labeled>
        <Labeled label="Quantity">
          <input name="quantity" className="input num" type="number" step="any" placeholder="1" />
        </Labeled>
        <Labeled label="Close time">
          <input name="closedTime" className="input num" type="time" defaultValue="16:00" />
        </Labeled>
        <Labeled label="Entry price">
          <input name="entryPrice" className="input num" type="number" step="any" />
        </Labeled>
        <Labeled label="Exit price">
          <input name="exitPrice" className="input num" type="number" step="any" />
        </Labeled>
        <Labeled label="Stop price" hint="for R">
          <input name="stopPrice" className="input num" type="number" step="any" />
        </Labeled>
        <Labeled label="Fees">
          <input name="fees" className="input num" type="number" step="any" placeholder="0" />
        </Labeled>
        <Labeled label="Net P&L" hint="required">
          <input name="netPnl" className="input num" type="number" step="any" required placeholder="0.00" />
        </Labeled>
        <Labeled label="Tags" hint="comma separated">
          <input name="tags" className="input" placeholder="breakout, A+" maxLength={200} />
        </Labeled>
      </div>
      <Labeled label="Notes">
        <textarea name="notes" className="input" rows={2} placeholder="What was the setup?" maxLength={2000} />
      </Labeled>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          Save trade
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function JournalTab({
  data,
  busy,
  send,
  date,
}: {
  data: DayData;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
  date: string;
}) {
  const note = data.note;
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const ok = await send("/api/notes", "POST", {
          date,
          title: form.get("title"),
          body: form.get("body"),
          mood: form.get("mood"),
          rating: form.get("rating"),
          tags: form.get("tags"),
        });
        if (ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2200);
        }
      }}
    >
      <Labeled label="Headline">
        <input name="title" className="input" defaultValue={note?.title ?? ""} placeholder="Followed the plan" maxLength={140} />
      </Labeled>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Mood">
          <select name="mood" className="input" defaultValue={note?.mood ?? ""}>
            {MOODS.map((m) => (
              <option key={m} value={m}>
                {m || "—"}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Discipline" hint="1–5">
          <select name="rating" className="input" defaultValue={note?.rating ?? ""}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {"★".repeat(r)}
              </option>
            ))}
          </select>
        </Labeled>
      </div>

      <Labeled label="Notes" hint="what worked, what didn't">
        <textarea
          name="body"
          className="input"
          rows={12}
          defaultValue={note?.body ?? ""}
          placeholder={"Market context…\nExecution…\nMistakes…\nOne thing to fix tomorrow…"}
          maxLength={20000}
        />
      </Labeled>

      <Labeled label="Tags" hint="comma separated">
        <input name="tags" className="input" defaultValue={note?.tags ?? ""} placeholder="revenge-trade, news-day" maxLength={200} />
      </Labeled>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save entry"}
        </button>
        {saved && <span className="text-[12.5px] text-profit">Saved</span>}
        {note && (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            disabled={busy}
            onClick={() => {
              if (confirm("Delete this journal entry?")) send(`/api/notes?date=${date}`, "DELETE");
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

function ManualTab({
  data,
  busy,
  send,
  date,
  ccy,
}: {
  data: DayData;
  busy: boolean;
  send: (url: string, method: string, body?: unknown) => Promise<boolean>;
  date: string;
  ccy: string;
}) {
  const entry = data.entry;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        await send("/api/day-entries", "POST", {
          date,
          netPnl: form.get("netPnl"),
          trades: form.get("trades"),
          wins: form.get("wins"),
          losses: form.get("losses"),
          rMultiple: form.get("rMultiple"),
        });
      }}
    >
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-muted">
        Log a day&apos;s totals without entering every trade — useful for back-filling history. These
        numbers are added on top of any imported trades for {date}.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label={`Net P&L (${ccy})`}>
          <input name="netPnl" className="input num" type="number" step="any" defaultValue={entry?.net_pnl ?? ""} required />
        </Labeled>
        <Labeled label="Trades">
          <input name="trades" className="input num" type="number" min="0" defaultValue={entry?.trades ?? ""} />
        </Labeled>
        <Labeled label="Wins">
          <input name="wins" className="input num" type="number" min="0" defaultValue={entry?.wins ?? ""} />
        </Labeled>
        <Labeled label="Losses">
          <input name="losses" className="input num" type="number" min="0" defaultValue={entry?.losses ?? ""} />
        </Labeled>
        <Labeled label="R multiple" hint="optional">
          <input name="rMultiple" className="input num" type="number" step="any" defaultValue={entry?.r_multiple ?? ""} />
        </Labeled>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {entry ? "Update day" : "Save day"}
        </button>
        {entry && (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            disabled={busy}
            onClick={() => {
              if (confirm("Remove this manual day entry?")) send(`/api/day-entries?date=${date}`, "DELETE");
            }}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

export function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
