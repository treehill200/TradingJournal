import { cookies } from "next/headers";

export const ACCOUNT_COOKIE = "tj_account";

/** The trading account the user last switched to, if any. */
export async function activeAccountId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCOUNT_COOKIE)?.value ?? null;
}
