'use client';

import { createContext, useContext, type MouseEvent } from 'react';

/**
 * MarketingShell owns the Request Demo modal; sections rendered as its
 * children reach the opener through this context.
 */

type RequestDemoOpener = (e: MouseEvent<HTMLButtonElement>) => void;

const RequestDemoContext = createContext<RequestDemoOpener | null>(null);

export const RequestDemoProvider = RequestDemoContext.Provider;

export function useRequestDemo(): RequestDemoOpener {
  const opener = useContext(RequestDemoContext);
  if (!opener) throw new Error('useRequestDemo must be used inside MarketingShell');
  return opener;
}
