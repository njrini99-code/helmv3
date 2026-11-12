'use client';

import { formatWith } from '../../../lib/dates';
import { AllowanceMeter } from './parts/Allowance';
import { ArrowRight, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { type ChAskData, type ChAskSuggestion } from '../../../data/coachhelm-chat-shape';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { BallMark } from './BallMark';

/** Players, and not one recorded round between them: nothing to report yet, and the chat still works. */
function NothingYet({ phone }: { phone: boolean }) {
  return (
    <div className="ch-ask-nothing" data-ch-code="CH-13322">
      {!phone && (
        <span className="ch-ask-nothing__ic" aria-hidden="true">
          <Icon icon={Users} size={18} />
        </span>
      )}
      <span className="ch-ask-nothing__t">
        <b>Nothing to report yet</b>
        <span>No player has a recorded round yet. You can still ask about your roster and schedule.</span>
      </span>
    </div>
  );
}

const TAG: Record<ChAskSuggestion['id'], string> = { brief: 'Team', strokes: 'Strokes gained', trending: 'Season', week: 'Practice plan' };
const DOT: Record<string, string> = { warn: 'is-warn', loss: 'is-warn', down: 'is-warn', gain: 'is-fine', up: 'is-fine' };
const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
/** The hour in the team's zone, so the server's render and the browser's say the same words. */
export function zoneHour(iso: string, timezone: string): number {
  return Number(formatWith(new Date(iso), { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }));
}

/**
 * Ask v2's home (06 E-HOME): the greeting, what moved since Monday from the Board (each line asks about itself), and starter rows with their tag. A player reads their own focus and
 * the Ask this week word instead; the meter is the screen's. The team's or player's scope sits above it, in the screen's scope line.
 * The chat's mark, the ball, sits over the greeting at rest: nothing is being worked on here.
 *
 * On a desk the question comes first (Q2, direction A, owner's pick 12 Nov 2026: "Cramped, basic, not airy or premium"): the
 * greeting and the question box are the page's middle, the starters sit under the box as chips, and what moved since Monday
 * (a player's focus) is a quiet list at the foot. The page reads in that order, so the focus moves in it too. The phone keeps
 * its own order: the opener and its rows over the box the screen pins.
 */
export function AskHomeV2({ data, phone, heroComposer, onAsk, focus }: { data: ChAskData; phone: boolean; heroComposer: ReactNode; onAsk: (text: string) => void; focus?: ReadonlyArray<{ text: string; ask: string | null; trend?: 'up' | 'warn' }> }) {
  const player = data.role === 'player';
  const findings = data.pulse?.findings ?? [];
  const hour = zoneHour(data.nowIso, data.timezone);
  const pulse = player
    ? !!focus?.length && (
        <div className="pulse">
          <b>Your focus</b>
          {focus.map((l) => {
            // A focus area with no outcome yet has no dot, and no empty 8px slot holding its words off the edge.
            const dot = l.trend ? DOT[l.trend] : undefined;
            return (
              <button type="button" className="rw" data-ch-ask-source="" key={l.text} disabled={!l.ask} onClick={() => l.ask && onAsk(l.ask)}>
                {dot && <i className={dot} />}
                <span>{l.text}</span>
              </button>
            );
          })}
        </div>
      )
    : findings.length > 0 && (
        <div className="pulse">
          <b>Since Monday</b>
          {findings.slice(0, 3).map((f) => (
            // "Tap any line to ask" holds for every line: a finding with no question of its own asks about its headline.
            <button type="button" className="rw" data-ch-ask-source="" key={f.id} onClick={() => onAsk(f.ask ?? `${f.headline}. What’s behind it, and what should I do?`)}>
              <i className={DOT[String(f.tone)] ?? 'is-flat'} />
              <span>{f.headline}</span>
            </button>
          ))}
          <small>From the CoachHelm board · tap any line to ask</small>
        </div>
      );
  const meter = player && data.allowance && <AllowanceMeter bucket={data.allowance} />;
  const starters = data.suggestions.length > 0 && (
    <ul className="sugg" aria-label="Questions to start with">
      {data.suggestions.slice(0, 4).map((s) => (
        <li key={s.id}>
          <button
            type="button"
            data-ch-ask-source=""
            data-ch-code="CH-13721"
            onClick={() => {
              haptic('select');
              onAsk(s.text);
            }}
          >
            {/* A chip on a desk is the question alone; the phone's row keeps its arrow and its tag. */}
            {phone && <Icon icon={ArrowRight} size={18} />}
            <span>{s.text}</span>
            {phone && <small>{TAG[s.id]}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={'ch-ak-home' + (phone ? ' is-phone' : '')} data-ch="ask-home">
      <div className="hi">
        <BallMark state="rest" on="paper" size="lg" />
        <h2>{player ? `${greeting(hour).replace('Good ', '').replace(/^./, (c) => c.toUpperCase())}${data.firstName ? `, ${data.firstName}` : ''}` : `${greeting(hour)}, ${data.firstName ?? 'Coach'}`}</h2>
        <p>{player ? 'I read your rounds and shots. Only you and your coaches see this.' : `I can read every round, shot, practice and event for ${data.teamName}.`}</p>
      </div>
      {data.noRounds && <NothingYet phone={phone} />}
      {phone ? (
        <>
          {pulse}
          {meter}
          {starters}
        </>
      ) : (
        <>
          {heroComposer}
          {starters}
          {(pulse || meter) && (
            <div className="foot">
              {pulse}
              {meter}
            </div>
          )}
        </>
      )}
    </div>
  );
}
