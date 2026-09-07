"use client";

import { useState } from "react";
import { IconCheck, IconDownload, IconLock } from "@/components/Icons";

/**
 * Shows a freshly issued set of codes. They are only ever readable here — the
 * server keeps hashes — so the screen insists you take them before moving on.
 */
export default function RecoveryCodes({
  codes,
  email,
  onDone,
  doneLabel = "I've saved them — continue",
}: {
  codes: string[];
  email?: string;
  onDone?: () => void;
  doneLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const asText =
    `Trading Journal recovery codes\n` +
    (email ? `Account: ${email}\n` : "") +
    `Issued: ${new Date().toISOString().slice(0, 10)}\n\n` +
    codes.map((c) => `  ${c}`).join("\n") +
    `\n\nEach code works once. Keep them somewhere only you can reach.\n`;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-3">
        <IconLock width={16} height={16} className="mt-0.5 shrink-0 text-warn" />
        <div className="text-[12.5px] leading-relaxed text-ink">
          <strong>Save these now.</strong> They are the only way back into your journal if you
          forget your password — there is no reset email. This is the one time they are shown.
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2 p-3">
        {codes.map((code) => (
          <li key={code} className="num rounded-md bg-canvas px-2.5 py-2 text-center text-[13px] tracking-wider">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
              setTimeout(() => setCopied(false), 2200);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <IconCheck width={15} height={15} /> : null}
          {copied ? "Copied" : "Copy codes"}
        </button>
        <a
          className="btn flex-1"
          download="trading-journal-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(asText)}`}
        >
          <IconDownload width={15} height={15} /> Download
        </a>
      </div>

      {onDone && (
        <>
          <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] text-muted">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[#6d8dff]"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I have saved my recovery codes somewhere safe.
          </label>
          <button type="button" className="btn btn-primary h-10 w-full" disabled={!confirmed} onClick={onDone}>
            {doneLabel}
          </button>
        </>
      )}
    </div>
  );
}
