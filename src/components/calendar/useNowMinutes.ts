import { useEffect, useState } from 'react';

/** Minutes since midnight now, updated every minute (for the "now" line in day and week views). */
export function useNowMinutes() {
  const get = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [now, setNow] = useState(get);
  useEffect(() => { const t = window.setInterval(() => setNow(get()), 60_000); return () => window.clearInterval(t); }, []);
  return now;
}
