import Link from "next/link";
import { Logo } from "@/components/Icons";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <div className="mb-6 flex justify-center">
          <Logo size={44} />
        </div>
        <div className="num text-[13px] text-faint">404</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-muted">
          The link may be out of date. Everything in your journal is reachable from the dashboard.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
