import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { accountBalance, netCashFlow } from "@/lib/metrics";
import { currency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { AccountList, AccountSettings, DangerZone, ProfileSettings } from "@/components/SettingsForms";
import ExportLinks from "@/components/ExportLinks";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const { account, accounts, trades, events, dayEntries, notes } = await loadWorkspace(
    user.id,
    await activeAccountId(),
  );
  const balance = accountBalance(account, trades, dayEntries, events);

  return (
    <>
      <PageHeader title="Settings" subtitle="Accounts, risk, profile and your data" />

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <Section
          title="Trading account"
          description="These settings drive the balance, the equity curve and every R multiple."
        >
          <AccountSettings account={account} balance={balance} />
        </Section>

        <Section title="Your accounts" description="Keep paper, live and backtest results completely apart.">
          <AccountList accounts={accounts} activeId={account.id} />
        </Section>

        <Section title="Data in this account" description="What is currently stored under “{account.name}”.">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Trades" value={trades.length.toLocaleString()} />
            <Fact label="Journal entries" value={notes.filter((n) => n.body || n.title).length.toLocaleString()} />
            <Fact label="Manual days" value={dayEntries.length.toLocaleString()} />
            <Fact label="Balance events" value={events.length.toLocaleString()} />
            <Fact label="Starting balance" value={currency(account.starting_balance, account.currency)} />
            <Fact label="Net deposits" value={currency(netCashFlow(events), account.currency, { sign: true })} />
            <Fact label="Realized P&L" value={currency(trades.reduce((s, t) => s + t.net_pnl, 0), account.currency, { sign: true })} />
            <Fact label="Balance" value={currency(balance, account.currency)} />
          </dl>
        </Section>

        <Section title="Export your data" description="Everything you put in, you can take out — no lock-in.">
          <ExportLinks query="" />
        </Section>

        <Section title="Profile" description="Your sign-in details. Only you can see any of this journal.">
          <ProfileSettings name={user.name} email={user.email} />
        </Section>

        <Section title="Danger zone" description="Irreversible actions. Export first if you might want the data back.">
          <DangerZone account={account} />
        </Section>

        <p className="pb-6 text-center text-[12px] text-faint">
          Need the import steps again? They live on the{" "}
          <Link href="/import" className="link">
            import page
          </Link>
          .
        </p>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <p className="mb-5 mt-1 text-[12.5px] text-muted">{description}</p>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[14px] font-semibold">{value}</dd>
    </div>
  );
}
