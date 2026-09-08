"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/colors";
import { currency, shortDate } from "@/lib/format";

export type CurvePoint = { date: string; balance: number; dayPnl: number; drawdown: number };

/** Equity curve with a hover crosshair. Drawn by hand so it matches the theme. */
/** Axis money labels: no cents once the numbers get big, so they always fit. */
function axisMoney(value: number, ccy: string): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return currency(value, ccy, { compact: true });
  if (abs >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return currency(value, ccy);
}

export default function EquityChart({
  points,
  ccy,
  height = 280,
  mode = "balance",
}: {
  points: CurvePoint[];
  ccy: string;
  height?: number;
  mode?: "balance" | "drawdown";
}) {
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

  if (points.length < 2) {
    return (
      <div ref={ref} className="grid w-full place-items-center overflow-hidden text-[13px] text-faint" style={{ height }}>
        Not enough data yet — import trades to draw the curve.
      </div>
    );
  }

  const pad = { top: 16, right: 14, bottom: 26, left: 74 };
  const w = Math.max(width, 320);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = points.map((p) => (mode === "balance" ? p.balance : p.drawdown));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.abs(rawMax) || 1;
  const min = mode === "drawdown" ? Math.min(rawMin, 0) : rawMin - span * 0.08;
  const max = mode === "drawdown" ? 0 : rawMax + span * 0.08;
  const range = max - min || 1;

  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - ((v - min) / range) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(values[i]).toFixed(2)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(2)},${(pad.top + innerH).toFixed(2)} L${x(0).toFixed(2)},${(pad.top + innerH).toFixed(2)} Z`;

  const up = values[values.length - 1] >= values[0];
  const stroke = mode === "drawdown" ? COLORS.loss : up ? COLORS.profit : COLORS.loss;

  // Tight drawdown ranges need a decimal or every tick reads the same.
  const ddDigits = range < 5 ? 1 : 0;
  const ticks = 4;
  const gridValues = Array.from({ length: ticks + 1 }, (_, i) => min + (range * i) / ticks);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 92))));

  const active = hover === null ? null : points[hover];

  return (
    <div ref={ref} className="relative w-full overflow-hidden">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={
          mode === "drawdown"
            ? `Drawdown from peak across ${points.length} days, deepest ${Math.min(...values).toFixed(1)} percent.`
            : `Account balance across ${points.length} days, from ${currency(points[0].balance, ccy)} to ${currency(points[points.length - 1].balance, ccy)}.`
        }
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = e.clientX - rect.left - pad.left;
          const idx = Math.round((rel / innerW) * (points.length - 1));
          setHover(Math.min(points.length - 1, Math.max(0, idx)));
        }}
      >
        <defs>
          <linearGradient id={`eq-${mode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridValues.map((value, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={w - pad.right}
              y1={y(value)}
              y2={y(value)}
              stroke={COLORS.line}
              strokeDasharray={i === 0 ? undefined : "3 4"}
            />
            <text x={pad.left - 10} y={y(value) + 4} textAnchor="end" fontSize="10.5" fill={COLORS.faint} className="num">
              {mode === "drawdown" ? `${value.toFixed(ddDigits)}%` : axisMoney(value, ccy)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#eq-${mode})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.date} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill={COLORS.faint}>
              {shortDate(p.date).replace(/, \d{4}$/, "")}
            </text>
          ) : null,
        )}

        {active && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke={COLORS.brand} strokeOpacity="0.45" />
            <circle cx={x(hover)} cy={y(values[hover])} r="4.5" fill={COLORS.surface} stroke={stroke} strokeWidth="2" />
          </g>
        )}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[152px] rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] shadow-xl"
          style={{
            left: Math.min(Math.max(x(hover) - 76, 4), Math.max(4, w - 160)),
            top: 6,
          }}
        >
          <div className="text-[11px] text-faint">{shortDate(active.date)}</div>
          <div className="num mt-1 text-[13.5px] font-semibold">{currency(active.balance, ccy)}</div>
          <div className={`num text-[11.5px] ${active.dayPnl > 0 ? "text-profit" : active.dayPnl < 0 ? "text-loss" : "text-faint"}`}>
            {currency(active.dayPnl, ccy, { sign: true })} on the day
          </div>
          {active.drawdown < 0 && (
            <div className="num text-[11.5px] text-faint">{active.drawdown.toFixed(2)}% from peak</div>
          )}
        </div>
      )}
    </div>
  );
}
