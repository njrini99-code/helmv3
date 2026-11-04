'use client';

import { useEffect, useState } from 'react';

/** The 8 second Undo: time left to `until`, and it reports when it closes. */
export function useUndoWindow(until: string | null, onExpire?: () => void): boolean {
  const [open, setOpen] = useState(!!until && Date.parse(until) > Date.now());
  useEffect(() => {
    if (!until) return;
    const left = Date.parse(until) - Date.now();
    if (left <= 0) return setOpen(false);
    setOpen(true);
    const t = setTimeout(() => {
      setOpen(false);
      onExpire?.();
    }, left);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one window per `until`
  }, [until]);
  return open;
}
