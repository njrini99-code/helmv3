'use client';

import { formatWith } from '../../../lib/dates';
import { AllowanceMeter } from './parts/Allowance';
import { ArrowRight, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { type ChAskData, type ChAskSuggestion } from '../../../data/coachhelm-chat-shape';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';

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
 */
export function AskHomeV2({ data, phone, heroComposer, onAsk, focus }: { data: ChAskData; phone: boolean; heroComposer: ReactNode; onAsk: (text: string) => void; focus?: ReadonlyArray<{ text: string; ask: string | null; trend?: 'up' | 'warn' }> }) {
  const player = data.role === 'player';
  const findings = data.pulse?.findings ?? [];
  const hour = zoneHour(data.nowIso, data.timezone);
  return (
    <div className={'ch-ak-home' + (phone ? ' is-phone' : '')} data-ch="ask-home">
      <div className="hi">
        <h2>{player ? `${greeting(hour).replace('Good ', '').replace(/^./, (c) => c.toUpperCase())}${data.firstName ? `, ${data.firstName}` : ''}` : `${greeting(hour)}, ${data.firstName ?? 'Coach'}`}</h2>
        <p>{player ? 'I read your rounds and shots. Only you and your coaches see this.' : `I can read every round, shot, practice and event for ${data.teamName}.`}</p>
      </div>
      {data.noRounds && <NothingYet phone={phone} />}
      {player
        ? !!focus?.length && (
            <div className="pulse">
              <b>Your focus</b>
              {focus.map((l) => (
                <button type="button" className="rw" key={l.text} disabled={!l.ask} onClick={() => l.ask && onAsk(l.ask)}>
                  <i className={l.trend ? DOT[l.trend] : undefined} />
                  <span>{l.text}</span>
                </button>
              ))}
            </div>
          )
        : findings.length > 0 && (
            <div className="pulse">
              <b>Since Monday</b>
              {findings.slice(0, 3).map((f) => (
                // "Tap any line to ask" holds for every line: a finding with no question of its own asks about its headline.
                <button type="button" className="rw" key={f.id} onClick={() => onAsk(f.ask ?? `${f.headline}. What's behind it, and what should I do?`)}>
                  <i className={DOT[String(f.tone)] ?? 'is-flat'} />
                  <span>{f.headline}</span>
                </button>
              ))}
              <small>From the CoachHelm board · tap any line to ask</small>
            </div>
          )}
      {player && data.allowance && <AllowanceMeter bucket={data.allowance} />}
      {data.suggestions.length > 0 && (
        <ul className="sugg" aria-label="Questions to start with">
          {data.suggestions.slice(0, 4).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                data-ch-code="CH-13721"
                onClick={() => {
                  haptic('select');
                  onAsk(s.text);
                }}
              >
                <Icon icon={ArrowRight} size={18} />
                <span>{s.text}</span>
                <small>{TAG[s.id]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!phone && heroComposer}
    </div>
  );
}
