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
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) {
    redirect("/golf/dashboard?message=What%27s+New+is+a+coach-only+feature");
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
