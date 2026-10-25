'use client';

import { useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Avatar } from '../../ui/Avatar';
import { AuthNotice } from './AuthNotice';
import { OPENING_PUSH_MS } from './auth-motion';
import { GateFrame, useGateView } from './GateFrame';
import { GateKey } from './gate-fields';
import { gateWrites, type GateWrites } from './gate-writes';
import { classLabel, joinFailure, teamPlace } from './join-team-state';

export interface JoinTeamData {
  code: string;
  team: { id: string; name: string; season?: string | null; organization?: { name: string; city?: string | null; state?: string | null; logoUrl?: string | null } };
  player: { name: string; year: string; email?: string | null };
}

export type JoinStage = 'confirm' | 'joined' | 'already';

/**
 * /golf/join/[code] in Clubhouse: the team the code names, and who is joining, before anything is joined. It is today's
 * confirm screen (`golf-join-team-client.tsx`) with the same call, `processGolfTeamInvitation(code, playerId)`, and the
 * same way on: the dashboard. Who is signed in is shown with a way out of it, so a link opened on someone else's
 * browser cannot join the wrong person. A code that names no team is `JoinInvalid`.
 *
 * `playerId` is not here: the page hands the action what it resolved, and this screen only carries it.
 */
export function JoinTeam({ data, playerId, writes = gateWrites, initial, navigate }: { data: JoinTeamData; playerId: string; writes?: GateWrites; initial?: { stage?: JoinStage; failure?: string }; navigate?: (href: string) => void }) {
  const router = useRouter();
  const reduced = useChReducedMotion();
  const { view, dir, moved, go, stageRef } = useGateView<JoinStage>(initial?.stage ?? 'confirm');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; tone: 'danger' | 'warning'; code: string } | null>(initial?.failure ? joinFailure(initial.failure) : null);
  const [leaving, setLeaving] = useState(false);
  const inFlight = useRef(false);
  const left = useRef(false);
  const { team, player } = data;
  const to = (href: string) => (navigate ? navigate(href) : router.push(href));
  const leave = () => {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    window.setTimeout(() => to('/golf/dashboard'), reduced ? 100 : Math.max(100, OPENING_PUSH_MS));
  };

  async function join() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    haptic('press');
    try {
      const result = await writes.join(data.code, playerId);
      if (!result.success) {
        haptic(/already on|one team/i.test(result.error ?? '') ? 'warning' : 'error');
        setFailure(joinFailure(result.error));
        inFlight.current = false;
        setBusy(false);
        return;
      }
      haptic('success');
      go(result.alreadyMember ? 'already' : 'joined');
      // As today's page: the success is seen for a moment, then the dashboard.
      window.setTimeout(leave, reduced ? 600 : 1400);
    } catch {
      haptic('error');
      setFailure(joinFailure(null, true));
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <GateFrame
      label={`Join ${team.name}`}
      say={{ title: team.name, line: team.organization?.name ?? 'Your team on GolfHelm' }}
      back={{ href: '/golf/join', label: 'Code' }}
      phase={leaving ? 'opening' : 'login'}
      viewKey={view}
      dir={dir}
      stageRef={stageRef}
    >
      {view === 'confirm' ? (
        <div className="ch-au-form" data-ch-code="CH-15934">
          <h1>Join {team.name}</h1>
          <p className="ch-au-sub">{teamPlace(team)}</p>
          <div className="ch-au-plate">
            <div className="ch-au-plate__row">
              {team.organization?.logoUrl ? <img className="ch-au-plate__logo" src={team.organization.logoUrl} alt="" width={40} height={40} /> : <Avatar name={team.name} size="lg" />}
              <div>
                <span className="ch-au-plate__k">Team</span>
                <b>{team.name}</b>
                {team.organization && <span className="ch-au-plate__s">{team.organization.name}</span>}
              </div>
            </div>
            <div className="ch-au-plate__row">
              <Avatar name={player.name} size="lg" />
              <div>
                <span className="ch-au-plate__k">Joining as</span>
                <b>{player.name}</b>
                <span className="ch-au-plate__s">{[classLabel(player.year), player.email].filter(Boolean).join(' · ')}</span>
              </div>
              <button
                type="button"
                className="ch-au-plate__swap"
                onClick={() => void writes.switchAccount(`/golf/join/${data.code}`)}
                // CH-15938: the way out of the wrong account.
                data-ch-code="CH-15938"
              >
                Not you?
              </button>
            </div>
          </div>
          <p className="ch-au-body">Golf players are on one team at a time. If you’re on another team, leave it first.</p>
          {failure && (
            <div className="ch-au-err" key={failure.message}>
              <AuthNotice tone={failure.tone} code={failure.code}>
                {failure.message}
              </AuthNotice>
            </div>
          )}
          <GateKey idle={`Join ${team.name}`} working="Joining…" busy={busy} type="button" onClick={() => void join()} code="CH-15432" />
          <p className="ch-au-alt">
            <Link href="/golf/dashboard">Not now</Link>
          </p>
        </div>
      ) : (
        <Joined name={team.name} already={view === 'already'} focusOnMount={moved} onContinue={leave} />
      )}
    </GateFrame>
  );
}

function Joined({ name, already, focusOnMount, onContinue }: { name: string; already: boolean; focusOnMount: boolean; onContinue: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    if (present && focusOnMount) titleRef.current?.focus({ preventScroll: true });
  }, [present, focusOnMount]);
  return (
    <div className="ch-au-form ch-au-sent" role="status" data-ch-code={already ? 'CH-15936' : 'CH-15937'}>
      <h1 ref={titleRef} tabIndex={-1}>
        {already ? `You’re already on ${name}` : `You’re on ${name}`}
      </h1>
      <p className="ch-au-sub">Team schedules, rounds and messages are in your dashboard.</p>
      <GateKey idle="Go to your dashboard" working="Opening…" type="button" onClick={onContinue} />
    </div>
  );
}

/** A code that names no team (today's "Invalid Invite Code"): what happened, and the one way forward. */
export function JoinInvalid({ navigate }: { navigate?: (href: string) => void } = {}) {
  const router = useRouter();
  const { view, dir, stageRef } = useGateView('invalid');
  const to = (href: string) => (navigate ? navigate(href) : router.push(href));
  return (
    <GateFrame label="That code doesn’t match a team" say={{ title: 'Find your team.', line: 'A code from your coach is all it takes' }} back={{ href: '/golf', label: 'Home' }} viewKey={view} dir={dir} stageRef={stageRef}>
      <div className="ch-au-form" role="alert" data-ch-code="CH-15935">
        <h1>That code doesn’t match a team</h1>
        <p className="ch-au-sub">It may have been typed wrong, or the team has changed its code. Check it with your coach.</p>
        <GateKey idle="Try another code" working="Opening…" type="button" onClick={() => to('/golf/join')} />
        <p className="ch-au-alt">
          <Link href="/golf/dashboard">Go to dashboard</Link>
        </p>
      </div>
    </GateFrame>
  );
}
