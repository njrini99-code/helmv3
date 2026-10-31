import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ChRoundReview } from '../../data/round-review-shape';
import { courseHref } from '../../data/course-key';
import { rebuiltHref } from '../../shell/nav';
import { Icon } from '../../ui/Icon';

/**
 * P-7 E1, E1b, E2: under the review's tee line, the way to the player's history at this course ("Your history at Finley
 * · 6 rounds"; a coach's "Lena's history at Finley · 6 rounds"). The first round there says so, unlinked. Nothing when the
 * round has no course, or the history didn't load.
 */
export function CourseLink({ review: r, coach }: { review: ChRoundReview; coach: boolean }) {
  const c = r.history?.course;
  if (!c) return null;
  if (c.rounds < 2) return <p className="ch-rv-crs is-first">First round at {c.name}</p>;
  const first = r.playerName?.split(' ')[0] ?? null;
  const whose = coach ? (first ? `${first}’s` : 'Their') : 'Your';
  const href = rebuiltHref(courseHref(c.key, coach ? { player: r.playerId } : {}), coach ? 'coach' : 'player');
  const text = `${whose} history at ${c.name} · ${c.rounds} rounds`;
  if (!href) return null;
  return (
    <Link className="ch-rv-crs" href={href}>
      <span>{text}</span>
      <Icon icon={ChevronRight} size={16} className="ch-rv-crs__go" />
    </Link>
  );
}
