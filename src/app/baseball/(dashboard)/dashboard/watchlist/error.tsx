'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconAlertCircle, IconRefresh } from '@/components/icons';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function WatchlistError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for monitoring
    if (process.env.NODE_ENV === 'development') {
      console.error('Watchlist page error:', error);
    }
  }, [error]);

  return (
    <>
      <Header title="Watchlist" subtitle="Something went wrong" />
      <div className="p-6 lg:p-8">
        <Card variant="glass">
          <CardContent className="p-8 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <IconAlertCircle size={32} className="text-red-600" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-warm-900 mb-2">
                Failed to load watchlist
              </h2>
              <p className="text-sm leading-relaxed text-warm-600 mb-6">
                We couldn&apos;t load your watchlist. This might be a temporary issue. 
                Please try again or refresh the page.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={reset} variant="primary">
                  <IconRefresh size={16} className="mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={() => window.location.reload()} 
                  variant="secondary"
                >
                  Refresh Page
                </Button>
              </div>
              {error.digest && (
                <p className="text-xs text-warm-400 mt-4">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
