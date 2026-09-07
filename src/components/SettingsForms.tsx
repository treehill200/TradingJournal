"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Labeled } from "@/components/DayPanel";
import { IconAlert, IconCheck, IconLock, IconPlus, IconTrash } from "@/components/Icons";
import RecoveryCodes from "@/components/RecoveryCodes";
import { currency } from "@/lib/format";
import type { Account } from "@/lib/types";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "INR", "BRL", "ZAR"];

function useSaver() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: String(payload.error ?? "Could not save.") });
        return null;
      }
      setMessage({ tone: "ok", text: "Saved." });
      router.refresh();
      return payload;
    } catch {
      setMessage({ tone: "error", text: "Network error. Try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, setMessage, send, router };
}

function Notice({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      className={`flex items-center gap-2 text-[12.5px] ${message.tone === "ok" ? "text-profit" : "text-loss"}`}
    >
      {message.tone === "ok" ? <IconCheck width={14} height={14} /> : <IconAlert width={14} height={14} />}
      {message.text}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AccountSettings({ account, balance }: { account: Account; balance: number }) {
  const { busy, message, send } = useSaver();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        send(`/api/accounts/${account.id}`, "PATCH", {
          name: form.get("name"),
          broker: form.get("broker"),
          kind: form.get("kind"),
          currency: form.get("currency"),
          startingBalance: form.get("startingBalance"),
          riskMode: form.get("riskMode"),
          riskValue: form.get("riskValue"),
          timezone: form.get("timezone"),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Account name">
          <input name="name" className="input" defaultValue={account.name} maxLength={60} required />
        </Labeled>
        <Labeled label="Broker" hint="optional">
          <input name="broker" className="input" defaultValue={account.broker} placeholder="TradingView Paper" maxLength={60} />
        </Labeled>
        <Labeled label="Account type">
          <select name="kind" className="input" defaultValue={account.kind}>
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </Labeled>
        <Labeled label="Currency">
          <select name="currency" className="input" defaultValue={account.currency}>
            {[...new Set([account.currency, ...CURRENCIES])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Starting balance" hint={`current: ${currency(balance, account.currency)}`}>
          <input
            name="startingBalance"
            type="number"
            step="any"
            className="input num"
            defaultValue={account.starting_balance}
          />
        </Labeled>
        <Labeled label="Timezone label" hint="how your CSV times are recorded">
          <input name="timezone" className="input" defaultValue={account.timezone} placeholder="UTC" maxLength={60} />
        </Labeled>
        <Labeled label="Risk mode" hint="defines 1R">
          <select name="riskMode" className="input" defaultValue={account.risk_mode}>
            <option value="fixed">Fixed amount per trade</option>
            <option value="percent">Percent of starting balance</option>
          </select>
        </Labeled>
        <Labeled label="Risk per trade" hint="0 disables R multiples">
          <input
            name="riskValue"
            type="number"
            step="any"
            min="0"
            className="input num"
            defaultValue={account.risk_value}
          />
        </Labeled>
      </div>

      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
        R multiples use a trade&apos;s own stop distance when the import provides one, and otherwise fall
        back to the risk per trade set here. Changing it re-derives every R in the account immediately.
      </p>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save account"}
        </button>
        <Notice message={message} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function AccountList({ accounts, activeId }: { accounts: Account[]; activeId: string }) {
  const { busy, message, send, router } = useSaver();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${account.kind === "live" ? "bg-profit" : "bg-brand"}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">
                {account.name}
                {account.id === activeId && <span className="ml-2 text-[11px] text-brand">active</span>}
              </div>
              <div className="text-[11px] text-faint">
                {account.kind === "live" ? "Live" : "Paper"} · {account.currency}
                {account.broker && ` · ${account.broker}`}
              </div>
            </div>
            {account.id !== activeId && (
              <form action="/api/accounts/active" method="post">
                <input type="hidden" name="accountId" value={account.id} />
                <button className="btn h-8 text-[12px]">Switch</button>
              </form>
            )}
            {accounts.length > 1 && (
              <button
                className="btn btn-ghost h-8 w-8 p-0 text-faint hover:text-loss"
                disabled={busy}
                aria-label={`Delete ${account.name}`}
                onClick={async () => {
                  if (
                    confirm(
                      `Delete "${account.name}" and every trade, note and import inside it? This cannot be undone.`,
                    )
                  ) {
                    await send(`/api/accounts/${account.id}`, "DELETE");
                    router.refresh();
                  }
                }}
              >
                <IconTrash width={15} height={15} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="space-y-3 rounded-xl border border-line bg-surface-2 p-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const ok = await send("/api/accounts", "POST", {
              name: form.get("name"),
              kind: form.get("kind"),
              currency: form.get("currency"),
              startingBalance: form.get("startingBalance"),
            });
            if (ok) setAdding(false);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Name">
              <input name="name" className="input" placeholder="Futures – live" required maxLength={60} />
            </Labeled>
            <Labeled label="Type">
              <select name="kind" className="input" defaultValue="paper">
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </Labeled>
            <Labeled label="Currency">
              <select name="currency" className="input" defaultValue="USD">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Starting balance">
              <input name="startingBalance" type="number" step="any" className="input num" defaultValue={0} />
            </Labeled>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy}>
              Create account
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="btn w-full" onClick={() => setAdding(true)}>
          <IconPlus width={15} height={15} /> Add a trading account
        </button>
      )}
      <Notice message={message} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ProfileSettings({ name, email }: { name: string; email: string }) {
  const { busy, message, send } = useSaver();

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const result = await send("/api/profile", "PATCH", {
          name: data.get("name"),
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        });
        if (result?.signedOut) window.location.href = "/login";
        form.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = ""));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Display name">
          <input name="name" className="input" defaultValue={name} maxLength={80} />
        </Labeled>
        <Labeled label="Email" hint="sign-in address">
          <input className="input" defaultValue={email} disabled />
        </Labeled>
        <Labeled label="Current password" hint="only to change it">
          <input name="currentPassword" type="password" className="input" autoComplete="current-password" />
        </Labeled>
        <Labeled label="New password" hint="8+ characters">
          <input name="newPassword" type="password" className="input" autoComplete="new-password" />
        </Labeled>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        <Notice message={message} />
      </div>
      <p className="text-[11.5px] text-faint">
        Changing your password signs out every device, including this one.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function DangerZone({ account }: { account: Account }) {
  const { busy, message, send, router } = useSaver();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium">Clear all data in “{account.name}”</div>
          <div className="text-[11.5px] text-faint">
            Removes every trade, balance event, manual day and journal entry. The account itself stays.
          </div>
        </div>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            if (confirm(`Delete all data inside "${account.name}"? This cannot be undone.`)) {
              await send(`/api/accounts/${account.id}/data`, "DELETE");
              router.refresh();
            }
          }}
        >
          Clear data
        </button>
      </div>

      <div className="rounded-xl border border-loss/25 bg-loss/5 px-3.5 py-3">
        <div className="text-[13px] font-medium text-loss">Delete your whole journal</div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          Deletes your login, every trading account and all trading data, permanently.
        </div>
        {confirmDelete ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const password = new FormData(e.currentTarget).get("password");
              const res = await fetch("/api/profile", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
              });
              if (res.ok) window.location.href = "/register";
              else {
                const payload = await res.json().catch(() => ({}));
                alert(payload.error ?? "Could not delete the account.");
              }
            }}
          >
            <label className="min-w-[220px] flex-1">
              <span className="label">Confirm with your password</span>
              <input name="password" type="password" className="input mt-1.5" required autoComplete="current-password" />
            </label>
            <button className="btn btn-danger" type="submit">
              Delete permanently
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn btn-danger mt-3" onClick={() => setConfirmDelete(true)}>
            Delete account…
          </button>
        )}
      </div>
      <Notice message={message} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function RecoveryCodeSettings({
  email,
  unused,
  total,
}: {
  email: string;
  unused: number;
  total: number;
}) {
  const { busy, message, send } = useSaver();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState(false);

  if (codes) {
    return (
      <div className="space-y-4">
        <RecoveryCodes codes={codes} email={email} />
        <button className="btn" onClick={() => setCodes(null)}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
        <IconLock width={16} height={16} className={unused > 0 ? "text-profit" : "text-warn"} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">
            {total === 0
              ? "No recovery codes yet"
              : `${unused} of ${total} code${total === 1 ? "" : "s"} unused`}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-faint">
            {total === 0
              ? "Without a code, a forgotten password cannot be recovered. Generate a set now."
              : "Each code signs you in once so you can set a new password. Generating a new set voids the old one."}
          </div>
        </div>
        {!asking && (
          <button className="btn" onClick={() => setAsking(true)}>
            {total === 0 ? "Generate codes" : "Generate new codes"}
          </button>
        )}
      </div>

      {asking && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2 p-3.5"
          onSubmit={async (e) => {
            e.preventDefault();
            const password = new FormData(e.currentTarget).get("password");
            const result = await send("/api/profile/recovery-codes", "POST", { password });
            if (result?.recoveryCodes) {
              setCodes(result.recoveryCodes as string[]);
              setAsking(false);
            }
          }}
        >
          <label className="min-w-[220px] flex-1">
            <span className="label">Confirm with your password</span>
            <input name="password" type="password" className="input mt-1.5" required autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </button>
          <button type="button" className="btn" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      )}
      <Notice message={message} />
    </div>
  );
}
