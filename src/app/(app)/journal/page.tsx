import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { activeAccountId } from "@/lib/active-account";
import { loadWorkspace } from "@/lib/store";
import { buildDayRollups } from "@/lib/metrics";
import PageHeader from "@/components/PageHeader";
import JournalList, { type JournalRow } from "@/components/JournalList";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const { account, trades, dayEntries, notes } = await loadWorkspace(user.id, await activeAccountId());
  const rollups = buildDayRollups(trades, account, dayEntries, notes);
  const noteMap = new Map(notes.map((n) => [n.date, n]));

  const dates = [...new Set([...rollups.keys(), ...noteMap.keys()])].sort().reverse();
  const rows: JournalRow[] = dates.map((date) => {
    const note = noteMap.get(date);
    const day = rollups.get(date);
    return {
      date,
      title: note?.title ?? "",
      body: note?.body ?? "",
      mood: note?.mood ?? "",
      rating: note?.rating ?? null,
      tags: note?.tags ?? "",
      netPnl: day?.netPnl ?? 0,
      trades: day?.trades ?? 0,
      winRate: day?.winRate ?? null,
    };
  });

  const written = rows.filter((r) => r.title || r.body || r.rating).length;

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={`${written} of ${rows.length} trading day${rows.length === 1 ? "" : "s"} journaled`}
      />
      <div className="px-4 py-5 sm:px-6">
        <JournalList rows={rows} ccy={account.currency} />
      </div>
    </>
  );
}
