import Sparkline from "@/components/Sparkline";

export default function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "neutral" | "profit" | "loss" | "brand";
  icon?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
}) {
  const valueClass =
    tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : tone === "brand" ? "text-brand" : "text-ink";

  return (
    <div className="card card-hover relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>

      <div className={`num mt-2.5 text-[26px] font-semibold leading-none ${valueClass}`}>{value}</div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0 text-[11.5px] text-faint">{sub}</div>
        {spark && spark.length > 1 && (
          <div className="-mb-1 -mr-1 shrink-0 opacity-90">
            <Sparkline values={spark} color={sparkColor} />
          </div>
        )}
      </div>
    </div>
  );
}
