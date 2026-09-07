import Link from "next/link";

export default function EmptyState({
  icon,
  title,
  body,
  actionHref,
  actionLabel,
  secondary,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-line bg-surface-2 text-brand">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">{body}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {actionHref && actionLabel && (
          <Link href={actionHref} className="btn btn-primary">
            {actionLabel}
          </Link>
        )}
        {secondary}
      </div>
    </div>
  );
}
