'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Force dynamic rendering to avoid prerender errors
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to new premium cinematic onboarding
    router.push('/baseball/coach-onboarding');
  }, [router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF6F1] via-[#F5F1EC] to-[#EAE6E1] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full mb-4" />
        <p className="text-slate-600">Redirecting to sign up...</p>
      </div>
    </div>
  );
}
