import {
  createSession, findUserByEmail, normalizeEmail, verifyAgainstDecoy, verifyPassword,
} from "@/lib/auth";
import { clientKey, fail, guard, json, readJson, str, throttle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return guard(async () => {
    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const password = str(body.password);

    if (!throttle(`login:${clientKey(req)}:${email}`, 12, 15 * 60 * 1000)) {
      return fail("Too many sign-in attempts. Try again in a few minutes.", 429);
    }
    if (!email || !password) return fail("Email and password are required.");

    const user = await findUserByEmail(email);

    // Same message either way, and the same amount of work either way: an
    // unknown email still pays for one scrypt, so response time reveals
    // nothing about which addresses have accounts.
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyAgainstDecoy(password);
    if (!ok || !user) return fail("Incorrect email or password.", 401);

    await createSession(user.id, req.headers.get("user-agent") ?? "");
    return json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  });
}
