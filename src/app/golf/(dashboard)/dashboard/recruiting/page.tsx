import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getRecruits } from '@/app/golf/actions/recruiting';
import { RecruitingPageClient } from '@/components/golf/recruiting/RecruitingPageClient';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export const metadata: Metadata = {
  title: 'Recruiting HQ | Helm Golf',
  description: 'Track prospects from watchlist to commitment.',
};

export const revalidate = 60;

export default async function RecruitingPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (session.role !== 'coach' || !session.coach) {
    // Players don't get to see the prospect list; bounce them to their hub.
    redirect('/golf/dashboard');
  }

  const result = await getRecruits();
  const initialRecruits = result.success && result.data ? result.data : [];

  return (
    <AnimatedPage>
      <LargeTitleHeader
        title="Recruiting HQ"
        subtitle="Track prospects from first look to letter of intent."
      />
      <AnimatedItem>
        <div className="px-4 md:px-6 pb-10 max-w-6xl mx-auto">
          <RecruitingPageClient initialRecruits={initialRecruits} />
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
