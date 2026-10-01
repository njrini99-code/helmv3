'use client';

import { Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ChAskData, ChAskFinding, ChAskSuggestion } from '../../../data/coachhelm-chat-shape';
import { pulseGapsLabel } from '../../../data/coachhelm-shape';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';

/** The Ask mark: the dark tile with the mint spark (mockup Main, PhoneHome). */
export function AskMark() {
  return (
    <span className="ch-ask-mark" aria-hidden="true">
      <Icon icon={Sparkles} size={22} />
    </span>
  );
}

function Greeting({ team, phone, children }: { team: string; phone: boolean; children?: ReactNode }) {
  return (
    <div className="ch-ask-greet">
      <AskMark />
      <h2>What do you want to know about {team}?</h2>
      <p>Answers come from your recorded rounds, signals and schedule.</p>
      {phone && children}
    </div>
  );
}

/** Players, and not one recorded round between them: the findings have nothing to say yet, and the chat still works. */
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
        <span>
          {phone
            ? 'No player has a recorded round yet. You can still ask about your roster and schedule.'
            : 'No player has a recorded round yet. Findings show up here after the first rounds come in. You can still ask about your roster and schedule.'}
        </span>
      </span>
    </div>
  );
}

function FindingCard({ f, onAsk }: { f: ChAskFinding; onAsk: (text: string) => void }) {
  const body = (
    <>
      <span className="ch-ask-find__cat">{f.category}</span>
      <span className="ch-ask-find__head">{f.headline}</span>
      <span className="ch-ask-find__ev">{f.evidence}</span>
    </>
  );
  return (
    <li className="ch-ask-find__item">
      {f.ask ? (
        <button
          type="button"
          className="ch-ask-find__card is-ask"
          onClick={() => {
            haptic('select');
            onAsk(f.ask!);
          }}
        >
          {body}
          <span className="ch-ask-find__q">{f.ask}</span>
        </button>
      ) : (
        <div className="ch-ask-find__card">{body}</div>
      )}
      {f.link && (
        <Link href={f.link.href} className="ch-ask-find__link">
          {f.link.label}
        </Link>
      )}
    </li>
  );
}

/** "Since you were last here": the program pulse's findings, each a question worth asking. Three failure-distinct states. */
function Findings({ data, onAsk, onRetry }: { data: ChAskData; onAsk: (text: string) => void; onRetry: () => void }) {
  const pulse = data.pulse;
  return (
    <section className="ch-ask-find" aria-label="Since you were last here">
      <div className="ch-ask-find__top">
        <h3>Since you were last here</h3>
        {pulse?.coverage && (
          <span className="ch-ask-find__cov">
            {pulse.coverage}
            {pulse.asOfLabel ? ` As of ${pulse.asOfLabel}.` : ''}
          </span>
        )}
      </div>
      {!pulse ? (
        <InlineNotice code="CH-13223" title="What’s new didn’t load" body="Asking still works. Your findings are not lost; try again in a moment." onRetry={onRetry} />
      ) : data.noRounds ? (
        <NothingYet phone={false} />
      ) : pulse.findings.length === 0 && !pulse.missing ? (
        <div className="ch-ask-nothing" data-ch-code="CH-13325">
          <span className="ch-ask-nothing__t">
            <b>Nothing is flagged right now</b>
            <span>Findings appear here as rounds, qualifiers and schedule activity are recorded.</span>
          </span>
        </div>
      ) : (
        <>
          {pulse.findings.length > 0 && (
            <ul className="ch-ask-find__grid">
              {pulse.findings.map((f) => (
                <FindingCard key={f.id} f={f} onAsk={onAsk} />
              ))}
            </ul>
          )}
          {/* CH-13226: a read the pulse is made from failed, so what is not listed was not checked: never "nothing is flagged". */}
          {pulse.missing && (
            <InlineNotice
              code="CH-13226"
              title={pulse.findings.length === 0 ? 'What’s new didn’t fully load' : 'What’s new may be incomplete'}
              body={`${pulseGapsLabel(pulse.missing)} didn’t load, so anything made from ${pulse.missing.length === 1 ? 'it' : 'them'} is missing here and was not checked. Asking still works. Try again in a moment.`}
              onRetry={onRetry}
            />
          )}
        </>
      )}
    </section>
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
 * The new chat. Desktop: the greeting, the big composer, up to five questions, then the findings. Phone: the greeting (with
 * the nothing-to-report line when there are no rounds) and three shortcut cards; the composer is pinned by the screen, and
 * the findings are left to the desktop (the phone board draws none).
 */
export function AskHome({ data, phone, heroComposer, onAsk, onRetry }: { data: ChAskData; phone: boolean; heroComposer: ReactNode; onAsk: (text: string) => void; onRetry: () => void }) {
  if (phone) {
    const cards = data.suggestions.filter((s) => s.id !== 'week').slice(0, 3);
    return (
      <div className="ch-ask-home is-phone">
        <Greeting team={data.teamName} phone>
          {data.noRounds && <NothingYet phone />}
          {/* CH-13223: the phone draws no findings, but a pulse that did not load is still said, never drawn as a greeting with nothing under it. */}
          {!data.pulse && <InlineNotice code="CH-13223" title="What’s new didn’t load" body="Asking still works. Your findings are not lost; try again in a moment." onRetry={onRetry} />}
        </Greeting>
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
                  <span>{s.sub(data.teamName)}</span>
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
      <Findings data={data} onAsk={onAsk} onRetry={onRetry} />
    </div>
  );
}
