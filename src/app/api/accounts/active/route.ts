import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccount } from "@/lib/store";
import { ACCOUNT_COOKIE } from "@/lib/active-account";
import { guard, str } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Switches the active trading account, then returns to the page you were on. */
export async function POST(req: Request) {
  return guard(async () => {
    const user = await requireUser();
    const form = await req.formData();
    const accountId = str(form.get("accountId"));
    const account = await getAccount(user.id, accountId);

    const referer = req.headers.get("referer");
    const back = referer && URL.canParse(referer) ? new URL(referer).pathname + new URL(referer).search : "/";
    const res = NextResponse.redirect(new URL(back, req.url), 303);
    if (account) {
      res.cookies.set(ACCOUNT_COOKIE, account.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  });
}
