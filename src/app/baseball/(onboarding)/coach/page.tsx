'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to new cinematic onboarding flow
export default function LegacyCoachOnboarding() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/baseball/coach-onboarding');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-slate-600">Redirecting...</p>
      </div>
    </div>
  );
}
