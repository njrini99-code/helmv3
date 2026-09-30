import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { PreviewBell } from '@/clubhouse/preview/PreviewBell';
import { PREVIEW_PLAYER, PREVIEW_SHELL } from '@/clubhouse/preview/fixtures';
import { PreviewEntry } from './PreviewEntry';

/**
 * Dev-only preview of round entry's dialogs and banners (the states the legacy
 * flow draws around setup and tracking), over a stand-in shot screen, with no
 * auth and no database. 404 in production. It is its own route because the
 * shared `[screen]` page belongs to the screens; the shape is the same.
 *
 *   /clubhouse-preview/entry ?state=recovery | recovery-busy | recovery-error
 *                                 | conflict | conflict-busy | conflict-error
 *                                 | practice | practice-busy | practice-error
 *                                 | reload | reloading | error
 *                                 | toast-save | toast-discard | toast-updated
 *   any state &bell=empty | failed | slow   (the top-bar notifications feed)
 */
export default async function ClubhouseEntryPreview({ searchParams }: { searchParams: Promise<{ state?: string; bell?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state, bell } = await searchParams;
  return (
    <PreviewBell state={bell}>
      <ClubhouseFrame userData={{ ...PREVIEW_PLAYER, name: 'Jonah Okafor' }} shell={PREVIEW_SHELL} pathname="/golf/dashboard/rounds/new" forceRebuilt>
        <PreviewEntry key={state ?? ''} state={state} />
      </ClubhouseFrame>
    </PreviewBell>
  );
}
