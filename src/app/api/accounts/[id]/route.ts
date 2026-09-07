import { nowIso, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAccount, listAccounts } from "@/lib/store";
import { refreshAccount } from "@/lib/import";
import { fail, guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return guard(async () => {
    const user = await requireUser();
    const { id } = await params;
    const account = await getAccount(user.id, id);
    if (!account) return fail("Account not found.", 404);

    const body = await readJson(req);
    const name = str(body.name, account.name).trim().slice(0, 60) || account.name;

    await run(
      `UPDATE accounts
          SET name = ?, broker = ?, kind = ?, currency = ?, starting_balance = ?,
              risk_mode = ?, risk_value = ?, timezone = ?, archived = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [
        name,
        str(body.broker, account.broker).slice(0, 60),
        str(body.kind, account.kind) === "live" ? "live" : "paper",
        (str(body.currency, account.currency) || "USD").toUpperCase().slice(0, 6),
        numeric(body.startingBalance, account.starting_balance) ?? 0,
        str(body.riskMode, account.risk_mode) === "percent" ? "percent" : "fixed",
        Math.max(0, numeric(body.riskValue, account.risk_value) ?? 0),
        str(body.timezone, account.timezone).slice(0, 60) || "UTC",
        body.archived === undefined ? account.archived : body.archived ? 1 : 0,
        nowIso(),
        id,
        user.id,
      ],
    );
    // Risk settings feed R multiples, so re-derive the account after a change.
    await refreshAccount(user.id, id);
    return json({ ok: true });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return guard(async () => {
    const user = await requireUser();
    const { id } = await params;
    const accounts = await listAccounts(user.id);
    if (accounts.length <= 1) return fail("You need at least one trading account.");
    if (!accounts.some((a) => a.id === id)) return fail("Account not found.", 404);

    for (const table of ["trades", "balance_events", "day_entries", "day_notes", "imports"]) {
      await run(`DELETE FROM ${table} WHERE user_id = ? AND account_id = ?`, [user.id, id]);
    }
    await run(`DELETE FROM accounts WHERE id = ? AND user_id = ?`, [id, user.id]);
    return json({ ok: true });
  });
}
