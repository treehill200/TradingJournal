"use client";

import { useEffect } from "react";
import { IconAlert } from "@/components/Icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-loss">
          <IconAlert />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">
          Your data is safe — nothing was written. Try again, and if it keeps happening check the
          server logs.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <a className="btn" href="/">
            Back to the dashboard
          </a>
        </div>
        {error.digest && <p className="num mt-6 text-[11px] text-faint">ref {error.digest}</p>}
      </div>
    </main>
  );
}
