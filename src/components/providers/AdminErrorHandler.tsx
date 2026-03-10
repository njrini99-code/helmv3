'use client';

import { useEffect } from 'react';
import { setupGlobalErrorHandler, trackPagePerformance } from '@/lib/admin-logger-client';

/**
 * AdminErrorHandler
 * 
 * Client component that sets up global error handlers for the admin dashboard.
 * Captures uncaught errors and unhandled promise rejections, sending them to
 * the admin_events table for monitoring.
 * 
 * Also tracks page performance and logs slow page loads.
 * 
 * Include this component once in your root layout.
 */
export function AdminErrorHandler() {
  useEffect(() => {
    // Set up global error handlers
    setupGlobalErrorHandler();
    
    // Track page performance (logs if page takes >5s to load)
    trackPagePerformance(5000);
  }, []);

  // This component doesn't render anything
  return null;
}

