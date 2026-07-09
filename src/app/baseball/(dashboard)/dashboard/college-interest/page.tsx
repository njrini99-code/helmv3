import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import CollegeInterestClient from './CollegeInterestClient';
import { fairwayScope } from '@/lib/redesign/flag';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

// SECURITY: this page had NO server-side auth check at all — an
// unauthenticated request rendered the full client shell (which then made its
// own Supabase calls). Role-specific messaging (college-player lock /
// not-yet-activated lock / "Coaches only") is intentionally left to
// CollegeInterestClient (via useAuth + usePlayerRecruitingGate) — this only
// closes the "must be signed in" gap.
export default async function CollegeInterestPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  return (
    <div className={fairwayScope('min-h-full')}>
      <CollegeInterestClient />
    </div>
  );
}
