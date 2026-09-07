"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlert, Logo } from "@/components/Icons";
import RecoveryCodes from "@/components/RecoveryCodes";

export default function RecoverForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ codes: string[]; email: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not verify that code.");
        setPending(false);
        return;
      }
      setIssued({ codes: body.recoveryCodes ?? [], email: String(data.email ?? "") });
      setPending(false);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  if (issued) {
    return (
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Password changed</h2>
        <p className="mt-2 text-sm text-muted">
          You are signed in on this device, and every other session has been signed out. The code
          you used is now spent, so here is a fresh set.
        </p>
        <div className="mt-7">
          <RecoveryCodes
            codes={issued.codes}
            email={issued.email}
            onDone={() => {
              router.replace("/");
              router.refresh();
            }}
            doneLabel="I've saved them — open my journal"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <Logo size={36} />
        <div className="text-[15px] font-semibold tracking-tight">Trading Journal</div>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Use a recovery code</h2>
      <p className="mt-2 text-sm text-muted">
        There is no reset email. Enter one of the codes you saved when you signed up, and choose a
        new password.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Email</span>
          <input name="email" type="email" required className="input" placeholder="you@example.com" autoComplete="email" autoFocus />
        </label>

        <label className="block">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[13px] font-medium">Recovery code</span>
            <span className="text-[11px] text-faint">used once</span>
          </div>
          <input
            name="code"
            required
            className="input num tracking-widest uppercase"
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={32}
          />
        </label>

        <label className="block">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[13px] font-medium">New password</span>
            <span className="text-[11px] text-faint">8+ characters</span>
          </div>
          <input name="password" type="password" required minLength={8} className="input" placeholder="••••••••" autoComplete="new-password" />
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-[13px] text-loss">
            <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary h-10 w-full" disabled={pending}>
          {pending ? "Checking…" : "Set a new password"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        Remembered it?{" "}
        <Link className="link font-medium" href="/login">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-faint">
        Lost your codes as well? Nothing here can let you back in — only whoever runs this instance
        can help, by resetting the password directly in the database.
      </p>
    </div>
  );
}
