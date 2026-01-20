'use client';

import { useEffect } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { IconInfo } from '@/components/icons';

export default function IntelligenceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Intelligence Dashboard Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-cream via-white to-cream">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconInfo size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Failed to Load Intelligence Dashboard
        </h2>
        <p className="text-warm-600 mb-6">
          {error.message || 'An unexpected error occurred while loading the dashboard.'}
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => window.location.href = '/golf/dashboard'}>
            Go to Dashboard
          </Button>
          <Button onClick={() => reset()}>
            Try Again
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
