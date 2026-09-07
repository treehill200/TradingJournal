import { destroySession } from "@/lib/auth";
import { guard, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return guard(async () => {
    await destroySession();
    return json({ ok: true });
  });
}
