"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconCheck, IconClose, IconRefresh, IconUpload } from "@/components/Icons";
import { currency } from "@/lib/format";

type Field = string;

type Report = {
  filename: string;
  dataset: "trades" | "balance";
  mode: string;
  rowsRead: number;
  parsed: number;
  fresh: number;
  duplicates: number;
  skipped: number;
  openPositions: number;
  warnings: string[];
  headers: string[];
  mappedColumns: { field: Field; header: string }[];
  unmappedColumns: string[];
  dayFirst: boolean;
  dateRange: { from: string; to: string } | null;
  netPnl: number;
  preview: {
    duplicate: boolean;
    date: string;
    symbol: string;
    side: string;
    quantity: number | null;
    entry: number | null;
    exit: number | null;
    amount: number;
    detail: string;
  }[];
  committed: boolean;
};

type Options = { dataset: string; mode: string; dayFirst: string; symbol: string; mapping: Record<string, string> };

type Item = {
  id: string;
  file: File;
  status: "analyzing" | "ready" | "importing" | "done" | "error";
  report?: Report;
  error?: string;
  options: Options;
  advanced: boolean;
};

const MAPPABLE: { field: string; label: string }[] = [
  { field: "symbol", label: "Symbol" },
  { field: "side", label: "Side / direction" },
  { field: "quantity", label: "Quantity" },
  { field: "entryPrice", label: "Entry price" },
  { field: "exitPrice", label: "Exit price" },
  { field: "price", label: "Fill price" },
  { field: "stopPrice", label: "Stop price" },
  { field: "openTime", label: "Open time" },
  { field: "closeTime", label: "Close time" },
  { field: "time", label: "Time (generic)" },
  { field: "netPnl", label: "Net P&L" },
  { field: "grossPnl", label: "Gross P&L" },
  { field: "commission", label: "Commission / fees" },
  { field: "swap", label: "Swap / financing" },
  { field: "amount", label: "Amount (balance)" },
  { field: "balance", label: "Running balance" },
  { field: "type", label: "Type / event" },
  { field: "status", label: "Status" },
  { field: "orderId", label: "Order id" },
  { field: "tradeId", label: "Trade id" },
  { field: "note", label: "Note" },
];

const MODE_LABELS: Record<string, string> = {
  closed: "Closed trades (one row per trade)",
  paired: "Entry / exit rows (Strategy Tester)",
  fills: "Order fills (matched FIFO)",
};

export default function ImportWizard({ ccy }: { ccy: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const analyze = useCallback(async (item: Item) => {
    const body = new FormData();
    body.set("file", item.file);
    body.set("commit", "false");
    if (item.options.dataset) body.set("dataset", item.options.dataset);
    if (item.options.mode) body.set("mode", item.options.mode);
    if (item.options.dayFirst) body.set("dayFirst", item.options.dayFirst);
    if (item.options.symbol) body.set("symbol", item.options.symbol);
    if (Object.keys(item.options.mapping).length) body.set("mapping", JSON.stringify(item.options.mapping));

    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const payload = await res.json();
      setItems((current) =>
        current.map((i) =>
          i.id === item.id
            ? res.ok
              ? { ...i, status: "ready", report: payload, error: undefined }
              : { ...i, status: "error", error: payload.error ?? "Could not read that file." }
            : i,
        ),
      );
    } catch {
      setItems((current) =>
        current.map((i) => (i.id === item.id ? { ...i, status: "error", error: "Upload failed." } : i)),
      );
    }
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const next: Item[] = [...files]
        .filter((f) => /\.(csv|tsv|txt)$/i.test(f.name) || f.type.includes("csv") || f.type.includes("text"))
        .map((file) => ({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          status: "analyzing" as const,
          options: { dataset: "", mode: "", dayFirst: "", symbol: "", mapping: {} },
          advanced: false,
        }));
      if (!next.length) return;
      setItems((current) => [...current, ...next]);
      next.forEach(analyze);
    },
    [analyze],
  );

  function patch(id: string, changes: Partial<Item>) {
    setItems((current) => current.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }

  function reanalyze(id: string, options: Options) {
    setItems((current) => {
      const item = current.find((i) => i.id === id);
      if (item) analyze({ ...item, options });
      return current.map((i) => (i.id === id ? { ...i, options, status: "analyzing" } : i));
    });
  }

  async function commitAll() {
    const pending = items.filter((i) => i.status === "ready" && (i.report?.fresh ?? 0) > 0);
    for (const item of pending) {
      patch(item.id, { status: "importing" });
      const body = new FormData();
      body.set("file", item.file);
      body.set("commit", "true");
      if (item.options.dataset) body.set("dataset", item.options.dataset);
      if (item.options.mode) body.set("mode", item.options.mode);
      if (item.options.dayFirst) body.set("dayFirst", item.options.dayFirst);
      if (item.options.symbol) body.set("symbol", item.options.symbol);
      if (Object.keys(item.options.mapping).length) body.set("mapping", JSON.stringify(item.options.mapping));

      try {
        const res = await fetch("/api/import", { method: "POST", body });
        const payload = await res.json();
        patch(item.id, res.ok
          ? { status: "done", report: payload }
          : { status: "error", error: payload.error ?? "Import failed." });
      } catch {
        patch(item.id, { status: "error", error: "Import failed." });
      }
    }
    router.refresh();
  }

  const readyCount = items.filter((i) => i.status === "ready" && (i.report?.fresh ?? 0) > 0).length;
  const totalFresh = items
    .filter((i) => i.status === "ready")
    .reduce((s, i) => s + (i.report?.fresh ?? 0), 0);
  const imported = items.filter((i) => i.status === "done");

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`card cursor-pointer border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-brand bg-brand/5" : "hover:border-[#29344a]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-brand">
          <IconUpload />
        </div>
        <div className="text-[14px] font-semibold">Drop your TradingView CSV here</div>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
          Trade History or Balance History, from paper trading or a connected broker. Drop several
          files at once — each is detected separately, and trades you already imported are skipped.
        </p>
      </div>

      {items.map((item) => (
        <FileCard
          key={item.id}
          item={item}
          ccy={ccy}
          onRemove={() => setItems((c) => c.filter((i) => i.id !== item.id))}
          onToggleAdvanced={() => patch(item.id, { advanced: !item.advanced })}
          onOptions={(options) => reanalyze(item.id, options)}
        />
      ))}

      {readyCount > 0 && (
        <div className="card sticky bottom-4 flex flex-wrap items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">
              {totalFresh} new row{totalFresh === 1 ? "" : "s"} ready across {readyCount} file
              {readyCount === 1 ? "" : "s"}
            </div>
            <div className="text-[11.5px] text-faint">
              Duplicates are skipped automatically. Nothing is written until you press import.
            </div>
          </div>
          <button className="btn btn-primary" onClick={commitAll}>
            Import {totalFresh} row{totalFresh === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {imported.length > 0 && (
        <div className="card border-profit/30 bg-profit/5 p-4">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-profit">
            <IconCheck width={16} height={16} />
            Import complete — your journal has been refreshed
          </div>
          <ul className="mt-2 space-y-1 text-[12.5px] text-muted">
            {imported.map((i) => (
              <li key={i.id}>
                <span className="text-ink">{i.report?.filename}</span> — {i.report?.fresh} added,{" "}
                {i.report?.duplicates} duplicate{i.report?.duplicates === 1 ? "" : "s"} skipped
                {i.report?.dateRange && ` · ${i.report.dateRange.from} → ${i.report.dateRange.to}`}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <a href="/" className="btn btn-primary">
              Open dashboard
            </a>
            <button className="btn" onClick={() => setItems([])}>
              Import more
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FileCard({
  item,
  ccy,
  onRemove,
  onToggleAdvanced,
  onOptions,
}: {
  item: Item;
  ccy: string;
  onRemove: () => void;
  onToggleAdvanced: () => void;
  onOptions: (options: Options) => void;
}) {
  const report = item.report;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold">{item.file.name}</div>
          <div className="text-[11.5px] text-faint">
            {(item.file.size / 1024).toFixed(1)} KB
            {report && ` · ${report.rowsRead} rows · detected as ${report.dataset === "balance" ? "balance history" : MODE_LABELS[report.mode] ?? report.mode}`}
          </div>
        </div>
        {item.status === "analyzing" && <span className="chip">Analysing…</span>}
        {item.status === "importing" && <span className="chip">Importing…</span>}
        {item.status === "done" && (
          <span className="chip border-profit/40 text-profit">
            <IconCheck width={12} height={12} /> Imported
          </span>
        )}
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={onRemove} aria-label="Remove file">
          <IconClose width={15} height={15} />
        </button>
      </div>

      {item.error && (
        <div className="flex items-start gap-2 px-4 py-3 text-[12.5px] text-loss">
          <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
          {item.error}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
            <Tile label="Rows read" value={String(report.rowsRead)} />
            <Tile label={report.dataset === "balance" ? "Events found" : "Trades found"} value={String(report.parsed)} />
            <Tile label="New" value={String(report.fresh)} tone={report.fresh > 0 ? "profit" : undefined} />
            <Tile label="Duplicates" value={String(report.duplicates)} />
            <Tile
              label={report.dataset === "balance" ? "Net cash" : "Net P&L"}
              value={currency(report.netPnl, ccy, { sign: true, compact: true })}
              tone={report.netPnl >= 0 ? "profit" : "loss"}
            />
          </div>

          {report.dateRange && (
            <div className="border-b border-line px-4 py-2.5 text-[12px] text-muted">
              Closing dates <span className="num text-ink">{report.dateRange.from}</span> →{" "}
              <span className="num text-ink">{report.dateRange.to}</span>
              {report.skipped > 0 && <span className="text-faint"> · {report.skipped} row(s) skipped</span>}
              {report.openPositions > 0 && (
                <span className="text-faint"> · {report.openPositions} still open</span>
              )}
            </div>
          )}

          {report.warnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2 border-b border-line px-4 py-2.5 text-[12px] text-warn">
              <IconAlert width={14} height={14} className="mt-0.5 shrink-0" />
              {warning}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Select
              label="Type"
              value={item.options.dataset || report.dataset}
              onChange={(v) => onOptions({ ...item.options, dataset: v })}
              options={[
                ["trades", "Trade history"],
                ["balance", "Balance history"],
              ]}
            />
            {(item.options.dataset || report.dataset) === "trades" && (
              <Select
                label="Layout"
                value={item.options.mode || report.mode}
                onChange={(v) => onOptions({ ...item.options, mode: v })}
                options={Object.entries(MODE_LABELS)}
              />
            )}
            <Select
              label="Dates"
              value={item.options.dayFirst || String(report.dayFirst)}
              onChange={(v) => onOptions({ ...item.options, dayFirst: v })}
              options={[
                ["false", "MM/DD/YYYY"],
                ["true", "DD/MM/YYYY"],
              ]}
            />
            {(item.options.dataset || report.dataset) === "trades" &&
              !report.mappedColumns.some((m) => m.field === "symbol") && (
                <label className="flex items-center gap-2">
                  <span className="label">Symbol</span>
                  <input
                    className="input h-8 w-[120px] text-[12px]"
                    placeholder="e.g. ES1!"
                    defaultValue={item.options.symbol}
                    maxLength={40}
                    onBlur={(e) => {
                      if (e.target.value !== item.options.symbol) {
                        onOptions({ ...item.options, symbol: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
              )}
            <button className="btn btn-ghost ml-auto" onClick={onToggleAdvanced}>
              <IconRefresh width={14} height={14} />
              {item.advanced ? "Hide column mapping" : "Column mapping"}
            </button>
          </div>

          {item.advanced && (
            <div className="grid gap-3 border-b border-line px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              {MAPPABLE.map(({ field, label }) => {
                const detected = report.mappedColumns.find((m) => m.field === field)?.header ?? "";
                return (
                  <label key={field} className="block">
                    <span className="label">{label}</span>
                    <select
                      className="input mt-1 h-8 text-[12px]"
                      value={item.options.mapping[field] ?? detected}
                      onChange={(e) =>
                        onOptions({
                          ...item.options,
                          mapping: { ...item.options.mapping, [field]: e.target.value },
                        })
                      }
                    >
                      <option value="">— not used —</option>
                      {report.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}

          {report.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    {(report.dataset === "balance"
                      ? ["Date", "Kind", "Amount", "Balance", "Note", ""]
                      : ["Close date", "Symbol", "Side", "Qty", "Entry → Exit", "Net P&L", ""]
                    ).map((h) => (
                      <th key={h} className="label px-4 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.preview.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-line-soft last:border-0 ${row.duplicate ? "opacity-45" : ""}`}
                    >
                      <td className="num px-4 py-2 whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-2">{row.symbol}</td>
                      {report.dataset === "balance" ? (
                        <>
                          <td className={`num px-4 py-2 ${row.amount >= 0 ? "text-profit" : "text-loss"}`}>
                            {currency(row.amount, ccy, { sign: true })}
                          </td>
                          <td className="num px-4 py-2 text-muted">
                            {row.exit === null ? "—" : currency(row.exit, ccy)}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-2 text-faint">{row.detail}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-muted">{row.side}</td>
                          <td className="num px-4 py-2 text-muted">{row.quantity ?? "—"}</td>
                          <td className="num px-4 py-2 text-muted">
                            {row.entry ?? "—"} → {row.exit ?? "—"}
                          </td>
                          <td className={`num px-4 py-2 font-semibold ${row.amount >= 0 ? "text-profit" : "text-loss"}`}>
                            {currency(row.amount, ccy, { sign: true })}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2 text-[11px] text-faint">{row.duplicate ? "already imported" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.parsed > report.preview.length && (
                <div className="px-4 py-2 text-[11.5px] text-faint">
                  Showing the first {report.preview.length} of {report.parsed} rows.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="label">{label}</div>
      <div
        className={`num mt-1 text-[16px] font-semibold ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="label">{label}</span>
      <select className="input h-8 w-auto text-[12px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
