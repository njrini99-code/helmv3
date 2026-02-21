'use client';

import { memo, type ReactNode } from 'react';
import { PeekPanel } from './PeekPanel';

interface PeekPanelProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the application and renders the peek panel.
 * Place this in your layout to enable peek panel functionality throughout the app.
 *
 * Usage:
 * ```tsx
 * // In layout.tsx
 * import { PeekPanelProvider } from '@/components/baseball/peek-panel';
 *
 * export default function Layout({ children }) {
 *   return (
 *     <PeekPanelProvider>
 *       {children}
 *     </PeekPanelProvider>
 *   );
 * }
 * ```
 */
const PeekPanelProviderComponent = function PeekPanelProvider({
  children,
}: PeekPanelProviderProps) {
  return (
    <>
      {children}
      <PeekPanel />
    </>
  );
};

export const PeekPanelProvider = memo(PeekPanelProviderComponent);
PeekPanelProvider.displayName = 'PeekPanelProvider';
