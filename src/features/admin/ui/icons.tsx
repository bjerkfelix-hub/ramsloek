// Small stroke icons for navigation. Decorative: the link text carries the name.
export type IconName = 'leaf' | 'box' | 'calendar' | 'tag' | 'pin' | 'mail' | 'people' | 'sliders' | 'more' | 'coins' | 'clock'

const PATHS: Record<IconName, React.ReactNode> = {
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5" />
      <ellipse cx="15" cy="13" rx="5.5" ry="2.5" />
      <path d="M9.5 13v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C5 10.7 10.8 5 19 5c0 8.2-5.7 14-14 14Z" />
      <path d="M5 19l8-8" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4Z" />
      <path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7Z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3 19.5c.4-3.3 2.9-5.5 6-5.5s5.6 2.2 6 5.5M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.5 14.3c1.9.6 3.2 2.5 3.5 5.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2.6} />
    </>
  ),
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export function Chevron() {
  return (
    <svg className="a-chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 2.5 4.5 4.5L5 11.5" />
    </svg>
  )
}
