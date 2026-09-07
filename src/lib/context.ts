import { requireUser, type User } from "./auth";
import { activeAccountId } from "./active-account";
import { resolveAccount } from "./store";
import type { Account } from "./types";

/** The signed-in user plus the account they are currently looking at. */
export async function context(accountId?: string | null): Promise<{ user: User; account: Account }> {
  const user = await requireUser();
  const account = await resolveAccount(user.id, accountId ?? (await activeAccountId()));
  return { user, account };
}
