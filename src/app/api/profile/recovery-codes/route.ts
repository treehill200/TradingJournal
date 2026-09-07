import { countRecoveryCodes, findUserByEmail, issueRecoveryCodes, requireUser, verifyPassword } from "@/lib/auth";
import { fail, guard, json, readJson, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    return json(await countRecoveryCodes(user.id));
  });
}

/** Issues a fresh set, invalidating the old one. Password-confirmed. */
export async function POST(req: Request) {
  return guard(async () => {
    const user = await requireUser();
    const body = await readJson(req);

    const stored = await findUserByEmail(user.email);
    if (!stored || !(await verifyPassword(str(body.password), stored.password_hash))) {
      return fail("Enter your current password to generate new codes.", 403);
    }

    return json({ ok: true, recoveryCodes: await issueRecoveryCodes(user.id) });
  });
}
