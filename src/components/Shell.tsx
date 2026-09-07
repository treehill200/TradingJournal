"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  IconCalendar, IconClose, IconDashboard, IconJournal, IconLogout, IconPanel,
  IconReport, IconSettings, IconStats, IconUpload, Logo,
} from "@/components/Icons";
import type { Account } from "@/lib/types";
import { currency } from "@/lib/format";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/calendar", label: "Calendar", icon: IconCalendar },
  { href: "/journal", label: "Journal", icon: IconJournal },
  { href: "/statistics", label: "Statistics", icon: IconStats },
  { href: "/reports", label: "Reports", icon: IconReport },
  { href: "/import", label: "Import", icon: IconUpload },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

type ShellState = { openMobile: () => void };
const ShellContext = createContext<ShellState>({ openMobile: () => {} });
export const useShell = () => useContext(ShellContext);

export default function Shell({
  user,
  accounts,
  account,
  balance,
  totalReturn,
  children,
}: {
  user: { name: string; email: string };
  accounts: Account[];
  account: Account;
  balance: number;
  totalReturn: number | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-tight">Trading Journal</div>
          <div className="truncate text-[11px] text-faint">Private workspace</div>
        </div>
        <button
          className="btn-ghost grid h-8 w-8 place-items-center rounded-lg lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <IconClose width={16} height={16} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-surface-3 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon
                width={17}
                height={17}
                className={active ? "text-brand" : "text-faint group-hover:text-muted"}
              />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <AccountCard account={account} accounts={accounts} balance={balance} totalReturn={totalReturn} />
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-dim text-[12px] font-bold text-canvas">
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium">{user.name || "Trader"}</div>
            <div className="truncate text-[11px] text-faint">{user.email}</div>
          </div>
          <form action="/api/auth/logout" method="post" onSubmit={handleSignOut}>
            <button className="btn-ghost grid h-8 w-8 place-items-center rounded-lg" title="Sign out" aria-label="Sign out">
              <IconLogout width={16} height={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <ShellContext.Provider value={{ openMobile: () => setMobileOpen(true) }}>
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] shrink-0 border-r border-line bg-surface/60 backdrop-blur lg:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60 animate-fade" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-[280px] border-r border-line bg-surface animate-slide-in">
              {sidebar}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}

async function handleSignOut(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function AccountCard({
  account,
  accounts,
  balance,
  totalReturn,
}: {
  account: Account;
  accounts: Account[];
  balance: number;
  totalReturn: number | null;
}) {
  const positive = totalReturn !== null && totalReturn >= 0;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${account.kind === "live" ? "bg-profit" : "bg-brand"}`}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{account.name}</span>
        <span className="chip h-5 px-1.5 text-[10px]">{account.kind === "live" ? "LIVE" : "PAPER"}</span>
      </div>
      <div className="num mt-2 text-[19px] font-semibold">{currency(balance, account.currency)}</div>
      <div className="mt-0.5 text-[11px] text-faint">
        {totalReturn === null ? (
          "Set a starting balance in Settings"
        ) : (
          <>
            <span className={positive ? "text-profit" : "text-loss"}>
              {positive ? "+" : ""}
              {totalReturn.toFixed(2)}%
            </span>{" "}
            total return
          </>
        )}
      </div>
      {accounts.length > 1 && (
        <form action="/api/accounts/active" method="post" className="mt-3">
          <select
            name="accountId"
            defaultValue={account.id}
            className="input h-8 text-[12px]"
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </form>
      )}
    </div>
  );
}

export function MobileMenuButton() {
  const { openMobile } = useShell();
  return (
    <button
      onClick={openMobile}
      className="btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-lg lg:hidden"
      aria-label="Open menu"
    >
      <IconPanel width={18} height={18} />
    </button>
  );
}
