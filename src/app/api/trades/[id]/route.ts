import { nowIso, run } from "@/lib/db";
import { context } from "@/lib/context";
import { guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return guard(async () => {
    const { user, account } = await context();
    const { id } = await params;
    const body = await readJson(req);
    const rMultiple = numeric(body.rMultiple);
    await run(
      `UPDATE trades SET tags = ?, notes = ?, r_multiple = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND account_id = ?`,
      [
        str(body.tags).slice(0, 200),
        str(body.notes).slice(0, 2000),
        rMultiple,
        nowIso(),
        id,
        user.id,
        account.id,
      ],
    );
    return json({ ok: true });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return guard(async () => {
    const { user, account } = await context();
    const { id } = await params;
    await run(`DELETE FROM trades WHERE id = ? AND user_id = ? AND account_id = ?`, [
      id,
      user.id,
      account.id,
    ]);
    return json({ ok: true });
  });
}
