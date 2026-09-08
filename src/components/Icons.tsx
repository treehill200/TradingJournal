import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={18}
      height={18}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => (
  <Base {...p}><rect x="3" y="3" width="7" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></Base>
);
export const IconCalendar = (p: P) => (
  <Base {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Base>
);
export const IconJournal = (p: P) => (
  <Base {...p}><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v18H7.5A2.5 2.5 0 0 0 5 22z" /><path d="M9 7h6M9 11h6" /></Base>
);
export const IconStats = (p: P) => (
  <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>
);
export const IconReport = (p: P) => (
  <Base {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Base>
);
export const IconSettings = (p: P) => (
  <Base {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></Base>
);
export const IconUpload = (p: P) => (
  <Base {...p}><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></Base>
);
export const IconDownload = (p: P) => (
  <Base {...p}><path d="M12 4v12M8 12l4 4 4-4" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></Base>
);
export const IconPlus = (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconFilter = (p: P) => (
  <Base {...p}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></Base>
);
export const IconChevronLeft = (p: P) => <Base {...p}><path d="M15 5l-7 7 7 7" /></Base>;
export const IconChevronRight = (p: P) => <Base {...p}><path d="M9 5l7 7-7 7" /></Base>;
export const IconChevronDown = (p: P) => <Base {...p}><path d="M5 9l7 7 7-7" /></Base>;
export const IconClose = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6L6 18" /></Base>;
export const IconTrend = (p: P) => (
  <Base {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></Base>
);
export const IconWallet = (p: P) => (
  <Base {...p}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16.5 14.5h.01" /></Base>
);
export const IconTarget = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></Base>
);
export const IconPulse = (p: P) => (
  <Base {...p}><path d="M2 12h4l2.5-7 4 14L15.5 12H22" /></Base>
);
export const IconGauge = (p: P) => (
  <Base {...p}><path d="M4.5 18a9 9 0 1 1 15 0" /><path d="M12 14l4-4" /></Base>
);
export const IconLogout = (p: P) => (
  <Base {...p}><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M15 16l4-4-4-4M19 12H9" /></Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}><path d="M4 7h16M10 4h4M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /><path d="M10 11v7M14 11v7" /></Base>
);
export const IconCheck = (p: P) => <Base {...p}><path d="M4 12.5l5 5L20 6.5" /></Base>;
export const IconAlert = (p: P) => (
  <Base {...p}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5h.01" /></Base>
);
export const IconInfo = (p: P) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Base>
);
export const IconPanel = (p: P) => (
  <Base {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9.5 4v16" /></Base>
);
export const IconPencil = (p: P) => (
  <Base {...p}><path d="M4 20h4L20 8a2.4 2.4 0 0 0-3.4-3.4L4.5 16.7z" /></Base>
);
export const IconBook = (p: P) => (
  <Base {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 19.5z" /></Base>
);
export const IconLayers = (p: P) => (
  <Base {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></Base>
);
export const IconSpark = (p: P) => (
  <Base {...p}><path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6z" /></Base>
);
export const IconLock = (p: P) => (
  <Base {...p}><rect x="4.5" y="10" width="15" height="11" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></Base>
);
export const IconArrowUpRight = (p: P) => <Base {...p}><path d="M7 17L17 7M8 7h9v9" /></Base>;
export const IconRefresh = (p: P) => (
  <Base {...p}><path d="M20 11a8 8 0 1 0-1.6 5.4" /><path d="M20 20v-5h-5" /></Base>
);

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(145deg, #7793ff, #4f6ae0 55%, #2f9d7b)",
        boxShadow: "0 6px 18px -8px rgba(109,141,255,.9)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        fill="none"
        stroke="#05070c"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12h3.5l2-6 3.5 12 2.5-8 1.5 2H21" />
      </svg>
    </div>
  );
}
