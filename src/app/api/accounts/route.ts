import { nowIso, run } from "@/lib/db";
import { newId } from "@/lib/ids";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/store";
import { fail, guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    return json({ accounts: await listAccounts(user.id) });
  });
}

/** Adds another trading account — paper and live stay completely separate. */
export async function POST(req: Request) {
  return guard(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const name = str(body.name).trim().slice(0, 60);
    if (!name) return fail("Give the account a name.");

    const existing = await listAccounts(user.id);
    if (existing.length >= 20) return fail("You already have 20 accounts.");

    const id = newId("a_");
    const ts = nowIso();
    await run(
      `INSERT INTO accounts (id, user_id, name, broker, kind, currency, starting_balance,
                             risk_mode, risk_value, timezone, is_default, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        id, user.id, name, str(body.broker).slice(0, 60),
        str(body.kind) === "live" ? "live" : "paper",
        (str(body.currency) || "USD").toUpperCase().slice(0, 6),
        numeric(body.startingBalance, 0) ?? 0,
        str(body.riskMode) === "percent" ? "percent" : "fixed",
        Math.max(0, numeric(body.riskValue, 0) ?? 0),
        str(body.timezone).slice(0, 60) || "UTC",
        ts, ts,
      ],
    );
    return json({ ok: true, id });
  });
}
