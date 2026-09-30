import { notFound } from 'next/navigation';
import { PreviewOnboard } from '@/clubhouse/preview/PreviewOnboard';
import type { OnboardStep } from '@/clubhouse/screens/onboard/logic';

const STEPS: readonly OnboardStep[] = ['intro', 'code', 'name', 'grad', 'account', 'game', 'photo', 'done', 'staffdone', 'rwho', 'rdetails', 'sent'];

/**
 * Dev-only preview of sign up and onboarding, over sample answers, with every
 * server call faked (there is one database, and it is production). 404 in production.
 *
 *   /clubhouse-preview/onboard ?step=intro|code|name|grad|account|game|photo|done|staffdone|rwho|rdetails|sent
 *     &who=invite (intro from an invite link) | matched (code already matched) | staff (the assistant's path) | joinfail (done, join failed)
 *     &sim=network | exists | breached | joinfail | upload   (the call that fails, and how)
 *     &hour=6.4 | 12.5 | 18.6 | 22   (a fixed time of day for the course; otherwise the viewer's clock)
 *   Codes that match: K7PQX4MN (roster, Varsity Golf), S4VN8QRT (staff). Anything else does not.
 */
export default async function ClubhouseOnboardPreview({ searchParams }: { searchParams: Promise<{ step?: string; who?: string; sim?: string; hour?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { step, who, sim, hour } = await searchParams;
  const h = hour === undefined ? undefined : Number(hour);
  const s = (STEPS as readonly string[]).includes(step ?? '') ? (step as OnboardStep) : 'intro';
  return <PreviewOnboard key={`${s}-${who}-${sim}-${hour}`} step={s} who={who} sim={sim} hour={h !== undefined && Number.isFinite(h) ? h : undefined} />;
}
