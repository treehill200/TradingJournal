import {
  consumeRecoveryCode, createSession, emailProblem, issueRecoveryCodes, normalizeEmail,
  passwordProblem, resetPassword,
} from "@/lib/auth";
import { clientKey, fail, guard, json, readJson, str, throttle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Password recovery without email: prove ownership with a one-time recovery
 * code, set a new password, and get a fresh set of codes.
 */
export async function POST(req: Request) {
  return guard(async () => {
    const body = await readJson(req);
    const email = normalizeEmail(str(body.email));
    const code = str(body.code);
    const password = str(body.password);

    const ip = clientKey(req);
    if (!throttle(`recover:${ip}`, 10, 60 * 60 * 1000) || !throttle(`recover:${ip}:${email}`, 5, 60 * 60 * 1000)) {
      return fail("Too many recovery attempts. Try again later.", 429);
    }

    const emailError = emailProblem(email);
    if (emailError) return fail(emailError);
    const passwordError = passwordProblem(password);
    if (passwordError) return fail(passwordError);
    if (!code.trim()) return fail("Enter one of your recovery codes.");

    const userId = await consumeRecoveryCode(email, code);
    // Deliberately vague: a wrong code and an unknown email look identical.
    if (!userId) return fail("That email and recovery code do not match.", 401);

    await resetPassword(userId, password);
    const recoveryCodes = await issueRecoveryCodes(userId);
    await createSession(userId, req.headers.get("user-agent") ?? "");

    return json({ ok: true, recoveryCodes });
  });
}
