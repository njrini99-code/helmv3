import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import { formatDateOnlyFull } from '@/lib/golf/date-only';
import { ClubhouseRoundReviewRoute } from '@/clubhouse/routes/round-review';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, total_score, score_to_par')
    .eq('id', id)
    .maybeSingle();

  if (!round) {
    return {
      title: 'Round Details',
      description: 'View golf round details and scorecard',
    };
  }

  const scoreToPar = round.score_to_par || 0;
  const scoreDisplay = scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar;

  return {
    title: `${round.course_name} - ${round.total_score || '--'} (${scoreDisplay})`,
    // `round_date` is a date-only column; `new Date(iso).toLocaleDateString()`
    // reads it back in the ambient zone and prints the previous day anywhere
    // west of UTC. This runs server-side (UTC on Vercel) so it happens to be
    // right in production today, which is exactly why it would rot silently.
    description: `Round details from ${round.course_name} on ${formatDateOnlyFull(round.round_date)} - Score: ${round.total_score || '--'} (${scoreDisplay})`,
  };
}

export default async function RoundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  // The round review, for the player and their coaches. P-7: `?hole=` opens the review on that hole (the course page's
  // plays link here).
  const query = await searchParams;
  const raw = query?.hole;
  const hole = Number(Array.isArray(raw) ? raw[0] : raw);
  // Team rounds' link says where it came from, so Back is named on the server render too.
  return <ClubhouseRoundReviewRoute id={id} hole={Number.isInteger(hole) && hole >= 1 && hole <= 18 ? hole : null} fromRounds={query?.from === 'rounds'} />;
}
