"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlert, Logo } from "@/components/Icons";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <Logo size={36} />
        <div className="text-[15px] font-semibold tracking-tight">Trading Journal</div>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">
        {isRegister ? "Create your journal" : "Welcome back"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {isRegister
          ? "Your workspace starts empty — no demo trades, just your data."
          : "Sign in to your private trading workspace."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {isRegister && (
          <Field label="Name" hint="optional">
            <input name="name" className="input" placeholder="Alex" autoComplete="name" maxLength={80} />
          </Field>
        )}

        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus={!isRegister}
          />
        </Field>

        <Field label="Password" hint={isRegister ? "8+ characters" : undefined}>
          <input
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            className="input"
            placeholder="••••••••"
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-[13px] text-loss">
            <IconAlert width={15} height={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary h-10 w-full" disabled={pending}>
          {pending ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link className="link font-medium" href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
