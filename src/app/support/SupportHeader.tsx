'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { GlassCard } from '@/components/ui/glass-card';

export function SupportHeader() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const homeHref = isNative ? '/golf/login' : '/';

  return (
    <header>
      <GlassCard
        hover={false}
        padding="none"
        className="rounded-none border-x-0 border-t-0 border-b border-warm-200/60 shadow-none"
      >
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            href={homeHref}
            className="flex items-center gap-2 text-warm-900 font-semibold hover:opacity-80 transition-opacity"
          >
            <span className="text-xl">Helm Sports Labs</span>
          </Link>
          {!isNative && (
            <Link
              href="/"
              className="text-sm text-warm-600 hover:text-warm-900 transition-colors"
            >
              Home
            </Link>
          )}
        </div>
      </GlassCard>
    </header>
  );
}
