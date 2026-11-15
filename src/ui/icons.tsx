import type { ReactNode } from 'react';

const ICONS = {
  power: (
    <>
      <path d="M12 3v8" />
      <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.8v2.4" />
      <path d="M12 18.8v2.4" />
      <path d="M2.8 12h2.4" />
      <path d="M18.8 12h2.4" />
      <path d="M5.5 5.5l1.7 1.7" />
      <path d="M16.8 16.8l1.7 1.7" />
      <path d="M5.5 18.5l1.7-1.7" />
      <path d="M16.8 7.2l1.7-1.7" />
    </>
  ),
  snow: (
    <>
      <path d="M12 3v18" />
      <path d="M4.2 7.5l15.6 9" />
      <path d="M19.8 7.5l-15.6 9" />
      <path d="M9.6 4.8L12 7l2.4-2.2" />
      <path d="M9.6 19.2L12 17l2.4 2.2" />
    </>
  ),
  drop: <path d="M12 3.5c3.2 3.7 5.5 6.6 5.5 9.7a5.5 5.5 0 0 1-11 0c0-3.1 2.3-6 5.5-9.7z" />,
  wind: (
    <>
      <path d="M3 8.5h10.5a2.75 2.75 0 1 0-2.75-2.75" />
      <path d="M3 12.5h15a3 3 0 1 1-3 3" />
      <path d="M3 16.5h7.5a2.25 2.25 0 1 1-2.25 2.25" />
    </>
  ),
  auto: (
    <>
      <path d="M4.5 11a7.5 7.5 0 0 1 13-4.2L20 9" />
      <path d="M20 4.5V9h-4.5" />
      <path d="M19.5 13a7.5 7.5 0 0 1-13 4.2L4 15" />
      <path d="M4 19.5V15h4.5" />
    </>
  ),
  moon: <path d="M20 14.2A8 8 0 0 1 9.8 4 8 8 0 1 0 20 14.2z" />,
  bolt: <path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12L13 3z" />,
  leaf: (
    <>
      <path d="M5 19c-.3-8.2 4.8-13.3 14-14 .3 9.2-4.8 14.3-14 14z" />
      <path d="M5 19c2.2-4.2 5.2-7.2 9.2-9.2" />
    </>
  ),
  bookmark: <path d="M7 4h10v16l-5-3.6L7 20V4z" />,
  left: <path d="M14.5 6l-6 6 6 6" />,
  right: <path d="M9.5 6l6 6-6 6" />,
  swingv: (
    <>
      <path d="M12 4v16" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M8 16.5l4 4 4-4" />
    </>
  ),
  swingh: (
    <>
      <path d="M4 12h16" />
      <path d="M7.5 8l-4 4 4 4" />
      <path d="M16.5 8l4 4-4 4" />
    </>
  ),
  hsplit: (
    <>
      <path d="M9 7l-5 5 5 5" />
      <path d="M15 7l5 5-5 5" />
    </>
  ),
  close: (
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>
  ),
  minus: <path d="M6 12h12" />,
  plus: (
    <>
      <path d="M6 12h12" />
      <path d="M12 6v12" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5l8.5 14.5h-17L12 4.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.1v.2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, strokeWidth = 1.6 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
