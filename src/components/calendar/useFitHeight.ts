import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Height that makes an element fill the rest of the window below its top edge, so a calendar
 * fits the screen without scrolling. Recomputed on resize. Returns undefined on small screens.
 */
export function useFitHeight<T extends HTMLElement>(opts: { bottomGap?: number; min?: number; minWidth?: number } = {}) {
  const { bottomGap = 24, min = 520, minWidth = 768 } = opts;
  const node = useRef<T | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const measure = useCallback(() => {
    const el = node.current;
    if (!el || window.innerWidth < minWidth) { setHeight(undefined); return; }
    const top = el.getBoundingClientRect().top + (el.closest('main')?.scrollTop ?? 0);
    setHeight(Math.max(min, Math.floor(window.innerHeight - top - bottomGap)));
  }, [bottomGap, min, minWidth]);

  useEffect(() => {
    measure();
    const raf = requestAnimationFrame(measure); // after fonts/layout settle
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [measure]);

  // Callback ref: measures as soon as the element appears (e.g. after a loading skeleton).
  const ref = useCallback((el: T | null) => {
    node.current = el;
    if (el) requestAnimationFrame(measure);
  }, [measure]);

  return { ref, height };
}

/** Minutes since midnight now, updated every minute (for the "now" line). */
export function useNowMinutes() {
  const get = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [now, setNow] = useState(get);
  useEffect(() => { const t = window.setInterval(() => setNow(get()), 60_000); return () => window.clearInterval(t); }, []);
  return now;
}
