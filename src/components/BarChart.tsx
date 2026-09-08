"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/colors";
import { currency } from "@/lib/format";

export type BarDatum = { label: string; value: number; sub?: string };

/** Diverging bar chart around a zero line — used for P&L by day, month, symbol. */
export default function BarChart({
  data,
  ccy,
  height = 220,
  horizontal = false,
  valueFormat = "currency",
}: {
  data: BarDatum[];
  ccy: string;
  height?: number;
  horizontal?: boolean;
  /** "count" for histograms, where the bar height is a tally, not money. */
  valueFormat?: "currency" | "count";
}) {
  const format = (value: number, compact = false) =>
    valueFormat === "count"
      ? String(Math.abs(Math.round(value)))
      : currency(value, ccy, { sign: true, compact });
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  if (!data.length) {
    return (
      <div className="grid place-items-center text-[13px] text-faint" style={{ height: height / 2 }}>
        No data for this selection.
      </div>
    );
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  if (horizontal) {
    return (
      <div ref={ref} className="w-full space-y-1.5 overflow-hidden">
        {data.map((d, i) => {
          const pct = (Math.abs(d.value) / maxAbs) * 50;
          const positive = d.value >= 0;
          return (
            <div key={d.label + i} className="group flex items-center gap-3">
              <div className="w-[92px] shrink-0 truncate text-[12px] text-muted" title={d.label}>
                {d.label}
              </div>
              <div aria-hidden="true" className="relative h-6 flex-1 rounded-md bg-surface-2">
                <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
                <div
                  className="absolute top-1 h-4 rounded-[3px] transition-opacity group-hover:opacity-90"
                  style={{
                    background: positive ? COLORS.profit : COLORS.loss,
                    opacity: 0.75,
                    left: positive ? "50%" : `${50 - pct}%`,
                    width: `${Math.max(pct, 0.6)}%`,
                  }}
                />
              </div>
              <div
                className={`num w-[92px] shrink-0 text-right text-[12px] font-semibold ${
                  positive ? "text-profit" : "text-loss"
                }`}
              >
                {format(d.value, true)}
              </div>
              {d.sub && <div className="w-[68px] shrink-0 text-right text-[11px] text-faint">{d.sub}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  const pad = { top: 12, right: 8, bottom: 24, left: 56 };
  const w = Math.max(width, 320);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const zeroY = pad.top + innerH / 2;
  const step = innerW / data.length;
  const barW = Math.max(3, Math.min(38, step * 0.62));

  return (
    <div ref={ref} className="relative w-full overflow-hidden">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={`Bar chart of ${data.length} values, from ${format(Math.min(...data.map((d) => d.value)))} to ${format(Math.max(...data.map((d) => d.value)))}.`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={pad.left} x2={w - pad.right} y1={zeroY} y2={zeroY} stroke={COLORS.line} />
        {[1, -1].map((sign) => (
          <text
            key={sign}
            x={pad.left - 10}
            y={zeroY - (sign * innerH) / 2 + 4}
            textAnchor="end"
            fontSize="10.5"
            fill={COLORS.faint}
            className="num"
          >
            {format(sign * maxAbs, true)}
          </text>
        ))}

        {data.map((d, i) => {
          const h = (Math.abs(d.value) / maxAbs) * (innerH / 2);
          const cx = pad.left + step * i + step / 2;
          const positive = d.value >= 0;
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(i)}>
              <rect x={cx - step / 2} y={pad.top} width={step} height={innerH} fill="transparent" />
              <rect
                x={cx - barW / 2}
                y={positive ? zeroY - h : zeroY}
                width={barW}
                height={Math.max(h, 1)}
                rx="2.5"
                fill={positive ? COLORS.profit : COLORS.loss}
                opacity={hover === null || hover === i ? 0.85 : 0.4}
              />
            </g>
          );
        })}

        {data.map((d, i) =>
          data.length <= 14 || i % Math.ceil(data.length / 12) === 0 ? (
            <text
              key={`l-${d.label}-${i}`}
              x={pad.left + step * i + step / 2}
              y={height - 7}
              textAnchor="middle"
              fontSize="10.5"
              fill={COLORS.faint}
            >
              {d.label.length > 8 ? d.label.slice(0, 7) + "…" : d.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] shadow-xl"
          style={{ left: Math.min(Math.max(pad.left + step * hover - 40, 0), Math.max(0, w - 150)) }}
        >
          <div className="text-[11px] text-faint">{data[hover].label}</div>
          <div className={`num font-semibold ${data[hover].value >= 0 ? "text-profit" : "text-loss"}`}>
            {format(data[hover].value)}
          </div>
          {data[hover].sub && <div className="text-[11px] text-faint">{data[hover].sub}</div>}
        </div>
      )}
    </div>
  );
}
