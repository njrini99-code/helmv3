'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  PREVIEW_AUTH_NOW,
  PREVIEW_FAILURES,
  PREVIEW_WELCOME_CAUGHT_UP,
  PREVIEW_WELCOME_COACH,
  PREVIEW_WELCOME_FAILED,
  PREVIEW_WELCOME_FIRST,
  PREVIEW_WELCOME_NO_NAME,
  PREVIEW_WELCOME_PLAYER,
} from '@/clubhouse/preview/fixtures-auth';
import { SignIn } from '@/clubhouse/screens/auth/SignIn';
import { Welcome } from '@/clubhouse/screens/auth/Welcome';
import { WelcomeStage } from '@/clubhouse/screens/auth/WelcomeStage';
import { FixedClock } from '@/clubhouse/screens/auth/use-hour';

const WELCOMES = {
  coach: PREVIEW_WELCOME_COACH,
  player: PREVIEW_WELCOME_PLAYER,
  caughtup: PREVIEW_WELCOME_CAUGHT_UP,
  first: PREVIEW_WELCOME_FIRST,
  failed: PREVIEW_WELCOME_FAILED,
  noname: PREVIEW_WELCOME_NO_NAME,
} as const;

/** The design's two sign-in people. */
const EMAIL = { coach: 'maya.reyes@university.edu', player: 'theo.marchetti@university.edu' } as const;

/**
 * The auth screens over sample data, with the clock held still (`hour=` picks
 * the time of day). No auth and no database: the sign-in form is handed a fake
 * action, Continue on the welcome goes nowhere, and a failure can be drawn
 * straight away (`fail=`).
 */
export function PreviewAuth({ screen, state, fail, hour, go }: { screen: 'signin' | 'welcome'; state?: string; fail?: string; hour?: number; /** Continue really navigates, into the preview dashboard, so the hand-off can be watched end to end. */ go?: boolean }) {
  const router = useRouter();
  const clock = useMemo(() => {
    const d = new Date(PREVIEW_AUTH_NOW);
    if (hour !== undefined) d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  }, [hour]);
  const welcome = WELCOMES[(state as keyof typeof WELCOMES) ?? 'coach'] ?? WELCOMES.coach;
  return (
    <FixedClock.Provider value={clock}>
      {screen === 'welcome' ? (
        <WelcomeStage>
          <Welcome data={welcome} navigate={go ? () => router.replace(state === 'player' ? '/clubhouse-preview/home-player' : '/clubhouse-preview/home') : () => {}} />
        </WelcomeStage>
      ) : (
        <SignIn
          signIn={go ? async () => ({ success: true, redirectTo: '/golf/dashboard' }) : async () => ({ success: false, error: 'Invalid login credentials' })}
          navigate={go ? () => router.push(`/clubhouse-preview/auth?screen=welcome&state=${state === 'player' ? 'player' : 'coach'}&go=1${hour !== undefined ? `&hour=${hour}` : ''}`) : undefined}
          initial={{ email: EMAIL[state === 'player' ? 'player' : 'coach'], failure: fail ? PREVIEW_FAILURES[fail] : undefined }}
        />
      )}
    </FixedClock.Provider>
  );
}
