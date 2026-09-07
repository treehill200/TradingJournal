import {
  createSession, createUser, emailProblem, findUserByEmail, issueRecoveryCodes,
  normalizeEmail, passwordProblem,
} from "@/lib/auth";
import { clientKey, fail, guard, json, readJson, str, throttle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return guard(async () => {
    if (process.env.ALLOW_SIGNUPS === "false") {
      return fail("Registration is closed on this instance.", 403);
    }
    if (!throttle(`register:${clientKey(req)}`, 10, 60 * 60 * 1000)) {
      return fail("Too many sign-up attempts. Try again later.", 429);
    }

    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const password = str(body.password);

    const emailError = emailProblem(email);
    if (emailError) return fail(emailError);
    const passwordError = passwordProblem(password);
    if (passwordError) return fail(passwordError);

    if (await findUserByEmail(email)) {
      return fail("An account with that email already exists.", 409);
    }

    const user = await createUser(email, password, str(body.name));
    const recoveryCodes = await issueRecoveryCodes(user.id);
    await createSession(user.id, req.headers.get("user-agent") ?? "");
    return json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
      recoveryCodes,
    });
  });
}
