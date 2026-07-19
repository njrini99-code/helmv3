import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getWhatsNewForCoach } from '@/app/golf/actions/whats-new';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayWhatsNew } from '@/components/fairway/pages/whats-new';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: "What's New | CoachHelm",
  description: 'Lifecycle activity across your team in the past 7 days',
};

// ============================================================================
// PAGE
// ============================================================================

export default async function WhatsNewPage() {
  const session = await getGolfSessionProfile();
  if (!session) {
    // `redirect()` throws a NEXT_REDIRECT digest — this never falls through —
    // but the explicit `return` keeps the coach-only fetch below structurally
    // unreachable for a signed-out request even if a future refactor (a test
    // double, an intermediate try/catch) ever changes that invariant (#201).
    redirect('/golf/login');
    return null;
  }

  const { coach } = session;
  if (!coach) {
    // Player session — this is a coach-only feature. Same defensive `return`:
    // `getWhatsNewForCoach()` below assumes a coach caller, so it must never
    // execute for a player regardless of how `redirect()` is invoked.
    redirect("/golf/dashboard?message=What%27s+New+is+a+coach-only+feature");
    return null;
  }

  const result = await getWhatsNewForCoach();

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayWhatsNew
        success={result.success}
        error={result.error}
        items={result.items}
        truncated={result.truncated}
      />
    </div>
  );
}
