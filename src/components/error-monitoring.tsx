'use client';

import { useEffect } from 'react';
import { setupGlobalErrorHandlers } from '@/lib/error-logging';

/**
 * ErrorMonitoring Component
 *
 * Sets up global error handlers for:
 * - Unhandled promise rejections
 * - Uncaught errors
 *
 * Add this component to your root layout to enable global error monitoring.
 *
 * Example:
 * ```tsx
 * // In app/layout.tsx
 * import { ErrorMonitoring } from '@/components/error-monitoring';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <ErrorMonitoring />
 *         {children}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function ErrorMonitoring() {
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  // This component renders nothing
  return null;
}
