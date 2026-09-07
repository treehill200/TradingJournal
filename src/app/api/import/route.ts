import { context } from "@/lib/context";
import { fail, guard, json, str } from "@/lib/api";
import { refreshAccount, runImport, type ImportOptions } from "@/lib/import";
import type { Dataset, Field, TradeMode } from "@/lib/tradingview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * One endpoint for both steps: `commit=false` analyses and reports what would
 * happen, `commit=true` writes the new rows.
 */
export async function POST(req: Request) {
  return guard(async () => {
    const { user, account } = await context();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) return fail("Choose a CSV file to import.");
    if (file.size === 0) return fail("That file is empty.");
    if (file.size > MAX_BYTES) return fail("That file is larger than 12 MB. Split the export and try again.");

    const text = await file.text();
    const commit = str(form.get("commit")) === "true";

    const datasetRaw = str(form.get("dataset"));
    const modeRaw = str(form.get("mode"));
    const dayFirstRaw = str(form.get("dayFirst"));

    let override: ImportOptions["override"];
    const overrideRaw = str(form.get("mapping"));
    if (overrideRaw) {
      try {
        const parsed = JSON.parse(overrideRaw) as Record<string, string>;
        override = Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === "string" && v),
        ) as Partial<Record<Field, string>>;
      } catch {
        return fail("Column mapping was not valid JSON.");
      }
    }

    const report = await runImport(
      user.id,
      account,
      file.name || "upload.csv",
      text,
      {
        dataset: datasetRaw === "trades" || datasetRaw === "balance" ? (datasetRaw as Dataset) : undefined,
        mode:
          modeRaw === "closed" || modeRaw === "paired" || modeRaw === "fills"
            ? (modeRaw as TradeMode)
            : undefined,
        dayFirst: dayFirstRaw === "" ? undefined : dayFirstRaw === "true",
        symbol: str(form.get("symbol")) || undefined,
        override,
      },
      commit,
    );

    // A committed import always leaves the account fully re-derived.
    if (commit) await refreshAccount(user.id, account.id);

    return json(report);
  });
}
