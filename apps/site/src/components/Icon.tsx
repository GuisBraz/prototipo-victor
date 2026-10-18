import type { ReactNode } from "react";

/** Conjunto único de ícones (traço 1,75, 24px) para manter consistência visual. */
const paths = {
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M9 4v16" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" /></>,
  trace: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H14a3 3 0 0 1 3 3v6.5" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 12h8M8 9h8M8 15h5" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 2.9 7.8 7 9.5 4.1-1.7 7-5.2 7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" /><path d="M12 8v4.5l3 1.5" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></>,
  tree: <><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="3" y="16" width="6" height="4" rx="1" /><rect x="15" y="16" width="6" height="4" rx="1" /><path d="M12 7v4M6 16v-3h12v3" /></>,
  compare: <><path d="M8 4v16M16 4v16" /><path d="M3 8h5M16 16h5M3 16h5M16 8h5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  gauge: <><path d="M4.5 18a8.5 8.5 0 1 1 15 0" /><path d="m12 13 4-4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
