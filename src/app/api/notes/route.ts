import { nowIso, one, run } from "@/lib/db";
import { newId } from "@/lib/ids";
import { context } from "@/lib/context";
import { fail, guard, json, numeric, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const body = await readJson(req);
    const date = str(body.date);
    if (!DATE.test(date)) return fail("A date in YYYY-MM-DD format is required.");

    const title = str(body.title).slice(0, 140);
    const text = str(body.body).slice(0, 20000);
    const mood = str(body.mood).slice(0, 40);
    const tags = str(body.tags).slice(0, 200);
    const ratingRaw = numeric(body.rating);
    const rating = ratingRaw === null ? null : Math.min(5, Math.max(1, Math.round(ratingRaw)));

    const existing = await one<{ id: string }>(
      `SELECT id FROM day_notes WHERE user_id = ? AND account_id = ? AND date = ?`,
      [user.id, account.id, date],
    );

    if (existing) {
      await run(
        `UPDATE day_notes SET title = ?, body = ?, mood = ?, rating = ?, tags = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
        [title, text, mood, rating, tags, nowIso(), existing.id, user.id],
      );
    } else {
      const ts = nowIso();
      await run(
        `INSERT INTO day_notes (id, user_id, account_id, date, title, body, mood, rating, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId("n_"), user.id, account.id, date, title, text, mood, rating, tags, ts, ts],
      );
    }
    return json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!DATE.test(date)) return fail("A date in YYYY-MM-DD format is required.");
    await run(`DELETE FROM day_notes WHERE user_id = ? AND account_id = ? AND date = ?`, [
      user.id,
      account.id,
      date,
    ]);
    return json({ ok: true });
  });
}
