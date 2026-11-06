import { ViewTransition } from 'react'

// Page content cross-fades on navigation (React <ViewTransition>; no-op where unsupported).
// Lives in each page, not the layout: layouts persist, so enter/exit would never fire there.
export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <ViewTransition enter="a-page" exit="a-page" default="none">
      <div className={`a-page ${className}`}>{children}</div>
    </ViewTransition>
  )
}

/** Large title with an optional trailing action (e.g. "Ny høsting"). */
export function LargeTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="a-titlebar">
      <h1 className="a-title">{children}</h1>
      {action}
    </div>
  )
}
