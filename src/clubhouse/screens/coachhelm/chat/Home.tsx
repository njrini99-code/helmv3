'use client';

import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { askSuggestionSub, type ChAskData, type ChAskSuggestion } from '../../../data/coachhelm-chat-shape';
import { haptic } from '../../../lib/haptics';
import { useChClockText } from '../../../lib/use-clock';
import { Icon } from '../../../ui/Icon';

function Greeting({ team, phone, children }: { team: string; phone: boolean; children?: ReactNode }) {
  return (
    <div className="ch-ask-greet">
      {/* The mockup's spark tile was dropped (owner, 2026-10-06: no stock AI marks); the serif question carries it. */}
      <h2>What do you want to know about {team}?</h2>
      <p>Answers come from your recorded rounds, signals and schedule.</p>
      {phone && children}
    </div>
  );
}

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

function Pills({ suggestions, onAsk }: { suggestions: ChAskSuggestion[]; onAsk: (text: string) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="ch-ask-pills" aria-label="Questions to start with">
      {suggestions.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            className="ch-ask-pill"
            data-ch-code="CH-13721"
            onClick={() => {
              haptic('select');
              onAsk(s.text);
            }}
          >
            {s.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The new chat. Desktop: the greeting, the big composer and up to five questions. Phone: the greeting (with the
 * nothing-to-report line when there are no rounds) and up to three question rows under it, the two set at the foot of the
 * screen just above the composer the screen pins. What is new since the last visit is the Board's header line, not here.
 */
export function AskHome({ data, phone, heroComposer, onAsk }: { data: ChAskData; phone: boolean; heroComposer: ReactNode; onAsk: (text: string) => void }) {
  const t = useChClockText();
  if (phone) {
    const cards = data.suggestions.filter((s) => s.id !== 'week').slice(0, 3);
    return (
      <div className="ch-ask-home is-phone">
        <Greeting team={data.teamName} phone>
          {data.noRounds && <NothingYet phone />}
        </Greeting>
        {/* The cardless pass (owner, 2026-10-08): the questions are action rows under the opener, between seams, their
            words in the green ink as an iPhone action row's are, not a sideways rail of outlined cards. The composer under
            them stays the anchor. */}
        {cards.length > 0 && (
          <ul className="ch-ask-cards" aria-label="Questions to start with">
            {cards.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="ch-ask-card"
                  data-ch-code="CH-13721"
                  onClick={() => {
                    haptic('select');
                    onAsk(s.text);
                  }}
                >
                  <b>{s.title}</b>
                  <span>{askSuggestionSub(s, data.teamName)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="ch-ask-home">
      <Greeting team={data.teamName} phone={false} />
      {heroComposer}
      <Pills suggestions={data.suggestions} onAsk={onAsk} />
      {/* Who the answers cover: a caveat on Ask's own answers, kept when the findings left. */}
      {data.pulse?.coverage && (
        <p className="ch-ask-cov">
          {data.pulse.coverage}
          {data.pulse.asOfLabel ? ` As of ${t(data.pulse.asOfLabel)}.` : ''}
        </p>
      )}
      {/* The findings block ("Since you were last here") moved to the Board's header line (design call D4); the greeting keeps
          the starter pills, and says when no player has a round yet. */}
      {data.noRounds && <NothingYet phone={false} />}
    </div>
  );
}
