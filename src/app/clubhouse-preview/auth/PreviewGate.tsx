'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { PREVIEW_AUTH_NOW } from '@/clubhouse/preview/fixtures-auth';
import { PREVIEW_STAFF, PREVIEW_STAFF_ADMIN, PREVIEW_STAFF_BAD, PREVIEW_STAFF_EXPIRED, PREVIEW_JOIN, PREVIEW_JOIN_LONG, PREVIEW_RESET_EMAIL, previewGateWrites, previewResetWrites } from '@/clubhouse/preview/fixtures-gate';
import { CoachPending } from '@/clubhouse/screens/auth/CoachPending';
import { DemoEntry } from '@/clubhouse/screens/auth/DemoEntry';
import { StaffInvite } from '@/clubhouse/screens/auth/StaffInvite';
import { JoinCode } from '@/clubhouse/screens/auth/JoinCode';
import { JoinInvalid, JoinTeam, type JoinStage } from '@/clubhouse/screens/auth/JoinTeam';
import { ResetPassword, type ResetPreview, type ResetStage } from '@/clubhouse/screens/auth/ResetPassword';
import { FixedClock } from '@/clubhouse/screens/auth/use-hour';

export type GateScreen = 'reset' | 'join' | 'joinconfirm' | 'staff' | 'pending' | 'demo';

const RESET_STAGES: readonly ResetStage[] = ['checking', 'form', 'expired', 'sent', 'saved'];

/**
 * The beside-sign-in screens over sample data, with the clock held still and every call faked (there is one database,
 * and it is production). `state=` draws a stage straight away; `state=live` runs the whole flow against fakes that answer
 * after a beat, so the motion between the stages can be watched. `sim=` is the call that fails, and how.
 */
export function PreviewGate({ screen, state, sim, hour, previous, fail }: { screen: GateScreen; state?: string; sim?: string; hour?: number; previous?: boolean; fail?: string }) {
  const router = useRouter();
  const clock = useMemo(() => {
    const d = new Date(PREVIEW_AUTH_NOW);
    if (hour !== undefined) d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  }, [hour]);
  const writes = useMemo(() => previewResetWrites(sim), [sim]);

  let body = null;
  if (screen === 'reset') {
    const stage = (RESET_STAGES as readonly string[]).includes(state ?? '') ? (state as ResetStage) : null;
    const initial: ResetPreview | undefined = stage
      ? { stage, email: stage === 'checking' ? undefined : PREVIEW_RESET_EMAIL, previous: previous ? 'theo.marchetti@university.edu' : undefined, field: fail === 'field' ? { field: 'password', message: 'That password is too easy to guess. Try a longer one.', code: 'CH-15030' } : fail === 'mismatch' ? { field: 'confirm', message: 'These passwords don’t match.', code: 'CH-15133' } : undefined, banner: fail === 'banner' ? 'Too many tries. Wait a minute, then try again.' : undefined }
      : undefined;
    body = <ResetPassword writes={writes} initial={initial} navigate={() => router.push('/clubhouse-preview/auth?screen=reset&state=live')} />;
  }
  if (screen === 'join') {
    const code = state === 'partial' ? 'K7PQ' : state === 'full' ? 'K7PQX4MN' : state === 'long' ? 'K7PQX4MN9' : state === 'problem' ? 'K7' : '';
    body = <JoinCode key={state ?? ''} initialCode={code} initialProblem={state === 'problem' || state === 'empty-problem'} navigate={() => router.push('/clubhouse-preview/auth?screen=joinconfirm')} />;
  }
  if (screen === 'joinconfirm') {
    if (state === 'invalid') body = <JoinInvalid navigate={() => router.push('/clubhouse-preview/auth?screen=join')} />;
    else {
      const stage = state === 'joined' || state === 'already' ? (state as JoinStage) : undefined;
      body = (
        <JoinTeam
          key={`${state}-${sim}`}
          data={state === 'long' ? PREVIEW_JOIN_LONG : PREVIEW_JOIN}
          playerId="player-1"
          writes={previewGateWrites(sim)}
          initial={{ stage, failure: state === 'another' ? 'You are already on Duke Women’s Golf. Golf players can only be on one team at a time.' : state === 'refused' ? 'Failed to join team. Please try again.' : undefined }}
          navigate={() => router.push('/clubhouse-preview/auth?screen=join')}
        />
      );
    }
  }
  if (screen === 'staff') {
    const preview = state === 'expired' ? PREVIEW_STAFF_EXPIRED : state === 'invalid' ? PREVIEW_STAFF_BAD : state === 'admin' ? PREVIEW_STAFF_ADMIN : PREVIEW_STAFF;
    const stage = state === 'create' || state === 'problem' || state === 'weak' ? 'create' : state === 'joined' ? 'joined' : state === 'accept' || state === 'wrong' || state === 'failed' ? 'accept' : state === 'checking' ? 'checking' : undefined;
    body = (
      <StaffInvite
        key={`${state}-${sim}`}
        token="preview-token"
        preview={preview}
        writes={previewGateWrites(sim ?? (state === 'create' || state === 'problem' ? 'signedout' : undefined))}
        initial={{
          stage,
          email: stage === 'accept' ? 'jordan.ellis@university.edu' : undefined,
          failure: state === 'wrong' ? 'This account already belongs to another program. Use a different email to join this one.' : state === 'failed' ? 'Could not add you to the team. Please try again.' : undefined,
          problem: state === 'problem' ? { field: 'password', message: 'Add a number.', code: 'CH-15142' } : undefined,
        }}
        navigate={() => router.push('/clubhouse-preview/auth?screen=staff')}
      />
    );
  }
  if (screen === 'pending') {
    body = <CoachPending key={state ?? ''} programName={state === 'noname' ? null : 'Pine Needles University'} refresh={() => {}} signOut={state === 'signoutfail' ? () => Promise.reject(new Error('x')) : async () => {}} initial={{ checked: state === 'checked' || state === 'signoutfail', signOutFailed: state === 'signoutfail' }} />;
  }
  if (screen === 'demo') {
    const stage = state === 'signedin' ? 'signedin' : state === 'checking' ? 'checking' : state === 'live' ? undefined : 'form';
    body = (
      <DemoEntry
        key={state ?? ''}
        writes={{ enter: () => new Promise((resolve) => setTimeout(() => resolve(sim === 'refused' ? { success: false as const, error: 'Too many demo requests from this network. Please try again in a few minutes.' } : { success: false as const, error: 'The preview does not open the demo.' }), 700)), signedIn: () => new Promise((resolve) => setTimeout(() => resolve(sim === 'signedin'), 600)) }}
        initial={{ stage, email: state === 'invite' ? 'coach@university.edu' : undefined, expired: state === 'expired', problem: state === 'problem' ? 'name' : undefined, error: state === 'refused' ? 'Too many demo requests from this network. Please try again in a few minutes.' : undefined, coachhelm: state === 'coachhelm' }}
        navigate={() => router.push('/clubhouse-preview/auth?screen=demo')}
      />
    );
  }
  return <FixedClock.Provider value={clock}>{body}</FixedClock.Provider>;
}
