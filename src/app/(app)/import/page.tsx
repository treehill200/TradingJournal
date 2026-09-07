import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { listImports, resolveAccount } from "@/lib/store";
import PageHeader from "@/components/PageHeader";
import ImportWizard from "@/components/ImportWizard";
import { IconInfo } from "@/components/Icons";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

const GUIDES = [
  {
    title: "Paper trading & broker trade history",
    steps: [
      "Open any chart on TradingView and expand the Trading Panel at the bottom of the screen.",
      "In the panel's account selector, pick the account you want — Paper Trading or your connected broker.",
      "Switch to the History tab (some brokers call it Orders history, Trades or Closed positions).",
      "Use the panel menu on the right — the ⋮ or gear icon — and choose Export data… / Download CSV.",
      "Pick a date range that covers the days you want, save the file, and drop it above.",
    ],
    note: "If the export lists individual fills rather than finished trades, they are matched FIFO per symbol into round trips, and each round trip is dated by its closing fill.",
  },
  {
    title: "Balance history (deposits, withdrawals, fees)",
    steps: [
      "In the same Trading Panel, open the Account or Balance history tab.",
      "Export it the same way and drop the file above — it is detected as balance history automatically.",
    ],
    note: "Deposits, withdrawals, transfers, interest and dividends move the equity curve. Rows that just restate trade P&L or commission are stored but excluded from the balance so nothing is counted twice.",
  },
  {
    title: "Strategy Tester results",
    steps: [
      "Open the Strategy Tester, go to List of Trades, and use the download icon to export the CSV.",
      "Drop it above — the entry row and exit row of each trade are paired automatically.",
    ],
    note: "Strategy Tester exports are backtests. Import them into a separate account so they never mix with your live results.",
  },
];

export default async function ImportPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const account = await resolveAccount(user.id, await activeAccountId());
  const history = await listImports(user.id, account.id);

  return (
    <>
      <PageHeader
        title="Import TradingView CSV"
        subtitle={`Importing into ${account.name} · ${account.kind === "live" ? "live" : "paper"} · ${account.currency}`}
      />

      <div className="grid items-start gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ImportWizard ccy={account.currency} />

          <div className="grid gap-4 lg:grid-cols-3">
            {GUIDES.map((guide) => (
              <section key={guide.title} className="card p-4">
                <h3 className="text-[13.5px] font-semibold">{guide.title}</h3>
                <ol className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted">
                  {guide.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="num grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[10px] text-faint">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11.5px] leading-relaxed text-faint">
                  <IconInfo width={14} height={14} className="mt-0.5 shrink-0" />
                  {guide.note}
                </p>
              </section>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-[14px] font-semibold">How the import works</h2>
            <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <Dot />
                <span>
                  <strong className="text-ink">Closing date wins.</strong> Every trade is filed on the day it
                  closed, exactly as written in your spreadsheet — never the day you uploaded it.
                </span>
              </li>
              <li className="flex gap-2">
                <Dot />
                <span>
                  <strong className="text-ink">No duplicates.</strong> Each trade gets a fingerprint from the
                  broker id, or from its symbol, size, prices and times. Uploading overlapping exports day
                  after day only ever adds what is new.
                </span>
              </li>
              <li className="flex gap-2">
                <Dot />
                <span>
                  <strong className="text-ink">Full refresh.</strong> After every import the account is
                  re-derived and the calendar, statistics and equity curve are rebuilt from scratch.
                </span>
              </li>
              <li className="flex gap-2">
                <Dot />
                <span>
                  <strong className="text-ink">Nothing is guessed silently.</strong> You see the detected
                  layout, every mapped column and a preview before a single row is written.
                </span>
              </li>
            </ul>
          </section>

          <section className="card p-4">
            <h3 className="text-[13.5px] font-semibold">Recent imports</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-faint">Nothing imported into this account yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {history.map((record) => (
                  <li key={record.id} className="flex items-start gap-3 text-[12.5px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-ink">{record.filename}</div>
                      <div className="text-[11px] text-faint">
                        {record.dataset === "balance" ? "Balance history" : "Trades"} · {record.inserted} added ·{" "}
                        {record.duplicates} duplicate{record.duplicates === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-faint">{relativeTime(record.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Dot() {
  return <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />;
}
