import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { CoachHome } from '@/clubhouse/screens/home/CoachHome';
import { HomeSkeleton } from '@/clubhouse/screens/home/HomeSkeleton';
import { PreviewError } from '@/clubhouse/preview/PreviewError';
import {
  PREVIEW_COACH,
  PREVIEW_HOME,
  PREVIEW_HOME_EMPTY,
  PREVIEW_HOME_FAILED,
  PREVIEW_SHELL,
} from '@/clubhouse/preview/fixtures';

/**
 * Dev-only Clubhouse preview: every screen and state rendered from the
 * handoff's sample data, with no auth and no database, for comparison with
 * design/handoff/screenshots. 404 in production.
 *
 *   /clubhouse-preview/home   ?state=empty | failed | loading | error
 */
export default async function ClubhousePreview({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await params;
  const { state } = await searchParams;

  const screens: Record<string, { path: string; node: React.ReactNode }> = {
    home: {
      path: '/golf/dashboard',
      node:
        state === 'loading' ? (
          <HomeSkeleton />
        ) : state === 'error' ? (
          <PreviewError kind="unknown" />
        ) : (
          <CoachHome data={state === 'empty' ? PREVIEW_HOME_EMPTY : state === 'failed' ? PREVIEW_HOME_FAILED : PREVIEW_HOME} />
        ),
    },
  };
  const entry = screens[screen];
  if (!entry) notFound();

  return (
    <ClubhouseFrame userData={PREVIEW_COACH} shell={PREVIEW_SHELL} pathname={entry.path} forceRebuilt>
      {entry.node}
    </ClubhouseFrame>
  );
}
