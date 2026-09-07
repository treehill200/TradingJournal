"use client";

import { MobileMenuButton } from "@/components/Shell";

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
        <MobileMenuButton />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate text-[19px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-faint">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
      </div>
    </header>
  );
}
