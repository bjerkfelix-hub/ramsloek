'use client'

import { useEffect } from 'react'

// Marks <html data-scrolled> once content scrolls under the top bar (drives the scroll-edge fade).
export function ScrollEdge() {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    const update = () => {
      frame = 0
      root.toggleAttribute('data-scrolled', window.scrollY > 4)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      root.removeAttribute('data-scrolled')
    }
  }, [])
  return null
}
