import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { IconLock, IconCalendar, IconUpload, IconStats, Logo } from "@/components/Icons";

const HIGHLIGHTS = [
  {
    icon: IconCalendar,
    title: "A calendar that tells the truth",
    body: "Every trading day coloured by realized P&L, with trade count, win rate and R at a glance.",
  },
  {
    icon: IconUpload,
    title: "Import straight from TradingView",
    body: "Drop in Trade History or Balance History exports. Repeat uploads never double-count a trade.",
  },
  {
    icon: IconStats,
    title: "Statistics that compound",
    body: "Equity curve, expectancy, profit factor, drawdown, streaks and per-symbol breakdowns.",
  },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getUser()) redirect("/");

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(680px 420px at 20% 8%, rgba(109,141,255,.20), transparent 62%)," +
              "radial-gradient(560px 380px at 80% 90%, rgba(52,211,153,.13), transparent 60%)",
          }}
        />
        <div className="relative">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={38} />
            <div>
              <div className="text-[15px] font-semibold tracking-tight">Trading Journal</div>
              <div className="text-xs text-faint">Private workspace</div>
            </div>
          </Link>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-balance text-[40px] font-semibold leading-[1.08] tracking-tight">
            Know which days
            <span className="block bg-gradient-to-r from-brand to-profit bg-clip-text text-transparent">
              actually make you money.
            </span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            Import your fills, journal the day, and let the numbers show the pattern. Your data stays
            yours — every account is fully separate and private.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand">
                  <Icon />
                </div>
                <div>
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-muted">{body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-faint">
          <IconLock width={14} height={14} />
          Passwords are hashed with scrypt. Trading data is never shared between accounts.
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px] animate-rise">{children}</div>
      </main>
    </div>
  );
}
