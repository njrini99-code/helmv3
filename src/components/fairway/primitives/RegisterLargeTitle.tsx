'use client';

/**
 * Registers a page's title with `LargeTitleContext` so `FairwayTopBar` names
 * the destination on a phone, and clears it on unmount. Renders nothing.
 * Split out of Masthead so Masthead itself stays a server component.
 */

import { useEffect } from 'react';
import { useLargeTitle } from '../app-shell/LargeTitleContext';

export function RegisterLargeTitle({ title }: { title: string }) {
  const { setRegisteredTitle } = useLargeTitle();
  useEffect(() => {
    setRegisteredTitle(title);
    return () => setRegisteredTitle(null);
  }, [title, setRegisteredTitle]);
  return null;
}
