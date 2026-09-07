import { run } from "@/lib/db";
import { hashPassword, passwordProblem, requireUser, verifyPassword, findUserByEmail, destroySession } from "@/lib/auth";
import { nowIso } from "@/lib/db";
import { fail, guard, json, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return guard(async () => {
    const user = await requireUser();
    const body = await readJson(req);

    const name = str(body.name, user.name).trim().slice(0, 80);
    await run(`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`, [name, nowIso(), user.id]);

    const newPassword = str(body.newPassword);
    if (newPassword) {
      const problem = passwordProblem(newPassword);
      if (problem) return fail(problem);

      const stored = await findUserByEmail(user.email);
      if (!stored || !(await verifyPassword(str(body.currentPassword), stored.password_hash))) {
        return fail("Your current password is not correct.", 403);
      }
      await run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [
        await hashPassword(newPassword),
        nowIso(),
        user.id,
      ]);
      // Every other device gets signed out when the password changes.
      await run(`DELETE FROM sessions WHERE user_id = ?`, [user.id]);
      await destroySession();
      return json({ ok: true, signedOut: true });
    }

    return json({ ok: true });
  });
}

/** Deletes the user and everything they own. */
export async function DELETE(req: Request) {
  return guard(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const stored = await findUserByEmail(user.email);
    if (!stored || !(await verifyPassword(str(body.password), stored.password_hash))) {
      return fail("Enter your password to delete the account.", 403);
    }
    // Explicit, ordered deletes rather than relying on cascade being enabled.
    for (const table of ["trades", "balance_events", "day_entries", "day_notes", "imports", "accounts", "sessions"]) {
      await run(`DELETE FROM ${table} WHERE user_id = ?`, [user.id]);
    }
    await run(`DELETE FROM users WHERE id = ?`, [user.id]);
    await destroySession();
    return json({ ok: true });
  });
}
