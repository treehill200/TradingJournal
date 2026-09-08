import { IconAlert, IconInfo, Logo } from "@/components/Icons";

/**
 * Shown instead of a sign-in form when the database is not usable. Letting
 * someone fill in a form that cannot possibly succeed is worse than telling
 * them, and whoever deployed the site is the one who can fix it.
 */
export default function SetupNotice({ message }: { message: string }) {
  return (
    <div>
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <Logo size={36} />
        <div className="text-[15px] font-semibold tracking-tight">Trading Journal</div>
      </div>

      <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-warn/30 bg-warn/10 text-warn">
        <IconAlert />
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Almost there</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The app is deployed and running, but it has nowhere to store your journal yet.
      </p>

      <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
        <div className="label mb-2">What the server reports</div>
        <p className="text-[12.5px] leading-relaxed text-ink">{message}</p>
      </div>

      <div className="mt-6">
        <div className="label mb-3">How to fix it</div>
        <ol className="space-y-3 text-[13px] leading-relaxed text-muted">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Create a free libSQL database at{" "}
              <a className="link" href="https://turso.tech" target="_blank" rel="noreferrer noopener">
                turso.tech
              </a>{" "}
              and copy its URL and auth token.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>
              Add them as environment variables on your host:
              <code className="mt-2 block rounded-lg border border-line bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-ink">
                DATABASE_URL=libsql://your-db.turso.io
                <br />
                DATABASE_AUTH_TOKEN=your-token
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>
              Redeploy. The tables are created on the first request, so there is nothing else to
              run.
            </span>
          </li>
        </ol>
      </div>

      <p className="mt-6 flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-faint">
        <IconInfo width={14} height={14} className="mt-0.5 shrink-0" />
        Running this on your own machine or a server with a disk instead? Then no database service
        is needed — leave <code className="text-muted">DATABASE_URL</code> unset, or point it at a
        writable path such as <code className="text-muted">file:./data/journal.db</code>.
      </p>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="num grid h-[20px] w-[20px] shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[10.5px] text-faint">
      {n}
    </span>
  );
}
