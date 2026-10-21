import { notFound } from 'next/navigation';
import { ShotEntryPreview } from './shot-entry-preview';

/**
 * Local fixture of the Fairway shot screen with the one-tap data-gap prompt
 * (CoachHelm Slice 8a), for screenshots. Synthetic data; no reads, no writes,
 * not served in production.
 */
export default async function ShotEntryPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state } = await searchParams;
  return <ShotEntryPreview state={state === 'complete' ? 'complete' : state === 'off' ? 'off' : 'entry'} />;
}
