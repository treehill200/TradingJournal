"use client";

import { IconDownload } from "@/components/Icons";

const EXPORTS = [
  { type: "trades", label: "Trades", hint: "Every trade with P&L, fees and R" },
  { type: "days", label: "Daily summary", hint: "One row per trading day" },
  { type: "notes", label: "Journal", hint: "All your written entries" },
  { type: "balance", label: "Balance history", hint: "Deposits, withdrawals and fees" },
];

export default function ExportLinks({ query }: { query: string }) {
  return (
    <section className="card p-4">
      <h2 className="text-[14px] font-semibold">Export to CSV</h2>
      <p className="mb-4 text-[11.5px] text-faint">
        Downloads respect the filters above. Everything is yours to take with you at any time.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {EXPORTS.map((item) => (
          <a
            key={item.type}
            href={`/api/export?type=${item.type}${query ? `&${query}` : ""}`}
            className="card card-hover flex items-center gap-3 p-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand">
              <IconDownload width={16} height={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{item.label}</span>
              <span className="block truncate text-[11px] text-faint">{item.hint}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
