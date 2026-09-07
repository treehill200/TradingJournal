import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { accountBalance } from "@/lib/metrics";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const { account, accounts, trades, events, dayEntries } = await loadWorkspace(
    user.id,
    await activeAccountId(),
  );
  const balance = accountBalance(account, trades, dayEntries, events);
  const totalReturn =
    account.starting_balance > 0
      ? ((balance - account.starting_balance) / account.starting_balance) * 100
      : null;

  return (
    <Shell
      user={{ name: user.name, email: user.email }}
      accounts={accounts}
      account={account}
      balance={balance}
      totalReturn={totalReturn}
    >
      {children}
    </Shell>
  );
}
