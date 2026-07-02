'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BaseballSignUpForm } from '@/components/auth/baseball-sign-up-form';
import { isNativeApp } from '@/lib/utils/capacitor';
import {
  AuthCard,
  AuthFooterLinks,
  BaseballAuthShell,
} from '@/components/auth/baseball-auth-shell';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Reads returnTo from the URL to preserve it through the sign-in switch link.
function SignupFooter() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const loginHref = returnTo ? `/baseball/login?returnTo=${encodeURIComponent(returnTo)}` : '/baseball/login';

  return (
    <AuthFooterLinks
      switchLabel="Already have an account?"
      switchHref={loginHref}
      switchCta="Sign in"
    />
  );
}

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    if (isNativeApp()) {
      // Helm Sports Labs memberships are purchased on the web.
      // The iOS app is for existing members only — redirect to login.
      router.replace('/baseball/login');
    }
  }, [router]);

  return (
    <BaseballAuthShell
      skipTargetId="signup-form"
      skipLabel="Skip to signup form"
      eyebrow="COACHES · PLAYERS · PROGRAMS"
      tagline="Start building your championship roster."
      footer={
        <Suspense fallback={<AuthFooterLinks switchLabel="Already have an account?" switchHref="/baseball/login" switchCta="Sign in" />}>
          <SignupFooter />
        </Suspense>
      }
    >
      <AuthCard ariaLabel="Create your account">
        <div className="mb-6 text-center">
          <h2 className="font-annual text-h3 font-semibold tracking-tight text-text-primary">
            Create your account
          </h2>
        </div>

        <Suspense
          fallback={
            <div className="animate-pulse space-y-4">
              <div className="h-20 rounded-xl bg-warm-100" />
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="h-12 rounded-xl bg-warm-100" />
                <div className="h-12 rounded-xl bg-warm-100" />
              </div>
              <div className="h-12 rounded-xl bg-warm-100" />
              <div className="h-12 rounded-xl bg-warm-100" />
              <div className="h-12 rounded-xl bg-grade-plus/15" />
            </div>
          }
        >
          <BaseballSignUpForm />
        </Suspense>
      </AuthCard>
    </BaseballAuthShell>
  );
}
