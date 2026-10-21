import { notFound } from 'next/navigation';
import { ShotEntryPreview } from './shot-entry-preview';

/**
 * Local fixture of the Fairway shot screen with the one-tap data-gap prompt
 * (CoachHelm Slice 8a) and the Slice 8b recovery tap and course nudge
 * (`?state=recovery|course|finish`), for screenshots. Synthetic data; no reads, no writes,
 * not served in production.
 */
export default async function ShotEntryPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state } = await searchParams;
  const known = ['complete', 'off', 'recovery', 'course', 'finish'] as const;
  const picked = known.find((k) => k === state) ?? 'entry';
  return <ShotEntryPreview state={picked} />;
}
