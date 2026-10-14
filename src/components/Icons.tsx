import type { ReactElement } from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ICONS: Record<string, ReactElement> = {
  inspect: (
    <g {...P}>
      <circle cx="10" cy="10" r="6" />
      <path d="M15 15l5 5" />
    </g>
  ),
  canal: (
    <g {...P}>
      <path d="M3 18c4 0 4-6 8-6s4-6 10-6" strokeWidth={4} stroke="#8a6a4a" />
      <path d="M3 18c4 0 4-6 8-6s4-6 10-6" stroke="#77BFD4" />
    </g>
  ),
  erase: (
    <g {...P}>
      <path d="M4 16l8-8 6 6-6 6H8z" />
      <path d="M12 20h8" />
    </g>
  ),
  gate: (
    <g {...P}>
      <path d="M5 4v16M19 4v16" />
      <path d="M5 10h14M5 14h14" />
    </g>
  ),
  bridge: (
    <g {...P}>
      <path d="M3 9h18M3 15h18" />
      <path d="M6 9v6M10 9v6M14 9v6M18 9v6" />
    </g>
  ),
  field: (
    <g {...P}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15v-4M11 15v-5M15 15v-4M19 15v-3" />
    </g>
  ),
  reservoir: (
    <g {...P}>
      <rect x="3" y="5" width="18" height="14" rx="5" />
      <path d="M6 13c2-1.5 4 1.5 6 0s4 1.5 6 0" />
    </g>
  ),
  turbine: (
    <g {...P}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" />
    </g>
  ),
  battery: (
    <g {...P}>
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <path d="M9 3v3M15 3v3M13 9l-3 4h4l-3 4" />
    </g>
  ),
  treatment: (
    <g {...P}>
      <rect x="3" y="7" width="7" height="12" rx="1" />
      <path d="M3 11h7M3 15h7" />
      <rect x="13" y="4" width="8" height="15" rx="4" />
      <path d="M17 9c1 1.5 1.5 2.2 1.5 3a1.5 1.5 0 01-3 0c0-.8.5-1.5 1.5-3z" />
    </g>
  ),
  connector: (
    <g {...P}>
      <path d="M8 21V8h8" />
      <path d="M16 8v3" />
      <path d="M16 15c.8 1.2 1.2 1.8 1.2 2.4a1.2 1.2 0 01-2.4 0c0-.6.4-1.2 1.2-2.4z" />
    </g>
  ),
  fishpond: (
    <g {...P}>
      <ellipse cx="12" cy="12" rx="9" ry="7" />
      <path d="M8 12c2-2 5-2 7 0-2 2-5 2-7 0zM15 12l2-1.5v3z" />
    </g>
  ),
  wetland: (
    <g {...P}>
      <path d="M3 18c3-2 6 2 9 0s6 2 9 0" />
      <path d="M8 16V7M12 15V5M16 16V8" />
      <circle cx="12" cy="5" r="1.5" />
    </g>
  ),
  floating: (
    <g {...P}>
      <path d="M3 17c3-2 6 2 9 0s6 2 9 0" />
      <rect x="6" y="10" width="12" height="4" rx="1.5" />
      <path d="M9 10V7M12 10V6M15 10V7" />
    </g>
  ),
  pump: (
    <g {...P}>
      <rect x="4" y="8" width="10" height="10" rx="2" />
      <path d="M14 13h4V5M15 8l3-3 3 3" />
    </g>
  ),
  fountain: (
    <g {...P}>
      <path d="M4 18h16M6 18c0-2 2-3 6-3s6 1 6 3" />
      <path d="M12 15V8M12 8c-2-3-5-3-6 0M12 8c2-3 5-3 6 0" />
    </g>
  ),
  pause: (
    <g {...P}>
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </g>
  ),
  play: (
    <g {...P}>
      <path d="M7 4l12 8-12 8z" fill="currentColor" />
    </g>
  ),
  undo: (
    <g {...P}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)" />
    </g>
  ),
  settings: (
    <g {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </g>
  ),
  goals: (
    <g {...P}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </g>
  ),
  soundOn: (
    <g {...P}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" />
    </g>
  ),
  soundOff: (
    <g {...P}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </g>
  ),
  plus: (
    <g {...P}>
      <path d="M12 5v14M5 12h14" />
    </g>
  ),
  minus: (
    <g {...P}>
      <path d="M5 12h14" />
    </g>
  ),
  fit: (
    <g {...P}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </g>
  ),
  close: (
    <g {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </g>
  ),
  lock: (
    <g {...P}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </g>
  ),
  journal: (
    <g {...P}>
      <path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2V4z" />
      <path d="M6 18a2 2 0 012-2h11" />
      <path d="M9 8h7M9 12h5" />
    </g>
  ),
  map: (
    <g {...P}>
      <path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" />
      <path d="M9 4v14M15 6v14" />
    </g>
  ),
  drop: (
    <g {...P}>
      <path d="M12 3c3 4.5 5 7.2 5 10a5 5 0 01-10 0c0-2.8 2-5.5 5-10z" />
    </g>
  ),
  bolt: (
    <g {...P}>
      <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
    </g>
  ),
  leaf: (
    <g {...P}>
      <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" />
      <path d="M5 19l8-8" />
    </g>
  ),
  coin: (
    <g {...P}>
      <path d="M4 18l4-10h8l4 10z" />
      <path d="M9 8l3-4 3 4" />
    </g>
  ),
  check: (
    <g {...P}>
      <path d="M5 12l5 5 9-10" />
    </g>
  ),
  warn: (
    <g {...P}>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </g>
  ),
  rain: (
    <g {...P}>
      <path d="M7 15a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0117 15z" />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </g>
  ),
  sun: (
    <g {...P}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5" />
    </g>
  ),
  star: (
    <g {...P}>
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </g>
  ),
};

export function Icon({ name, size = 22, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {ICONS[name] ?? ICONS.inspect}
    </svg>
  );
}
