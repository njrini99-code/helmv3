'use client';

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { ChWhatsNew, ChWhatsNewDay, ChWhatsNewItem, ChWhatsNewKind } from '../../data/whats-new-shape';
import { useChSessionState } from '../../lib/session-state';
import { useChClockText } from '../../lib/use-clock';
import { useLastGood } from '../../lib/use-last-good';
import { useChPhone } from '../../lib/use-phone';
import { useRefresh } from '../../lib/use-refresh';
import { PhoneTop } from '../../shell/phone-chrome';
import { rebuiltHref } from '../../shell/nav';
import { LedgerList, LedgerRow } from '../../ui/Ledger';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { EmptyState } from '../../ui/States';
import '../../styles/rounds.css';
import '../../styles/whats-new.css';
import { plural, pluralWord } from '../../lib/plural';
import { LargeTitle } from '../../ui/LargeTitle';

type Filter = 'all' | ChWhatsNewKind;

/** The feed landed: a week worth keeping while a later refresh of it fails (`useLastGood`). */
const landed = (d: ChWhatsNew) => !d.error;

/** A row opens the player's stats once that screen is rebuilt for the coach (nav.rebuiltHref); a focus area opens their Development tab. */
export const whatsNewLink = (it: Pick<ChWhatsNewItem, 'playerId' | 'kind'>) =>
  rebuiltHref(`/golf/dashboard/stats?player=${it.playerId}${it.kind === 'focus' ? '&tab=dev' : ''}`, 'coach');

function WhatsNewRow({ it }: { it: ChWhatsNewItem }) {
  const href = whatsNewLink(it);
  const time = useChClockText()(it.time);
  return (
    <LedgerRow
      lead={time}
      title={it.title}
      meta={
        <span className="ch-wn-meta">
          <span>
            {it.player} · <span className={it.good ? 'ch-wn-what is-gain' : 'ch-wn-what'}>{it.what}</span>
          </span>
          {it.detail && <span className="ch-wn-detail">{it.detail}</span>}
        </span>
      }
      href={href ?? undefined}
      label={`${it.what}: ${it.title}, ${it.player}, ${time}`}
    />
  );
}

/** The week's days, drawn in a child of the section's boundary so a row that cannot draw is contained there. */
function Days({ days }: { days: ChWhatsNewDay[] }) {
  return (
    <>
      {days.map((d) => (
        <Section key={d.key} id={`ch-wn-${d.key}`} title={d.label} meta={<span className="ch-num">{d.items.length} {pluralWord(d.items.length, 'update')}</span>}>
          <LedgerList label={`${d.label}, ${d.items.length} updates`}>
            {d.items.map((it) => (
              <WhatsNewRow key={it.key} it={it} />
            ))}
          </LedgerList>
        </Section>
      ))}
    </>
  );
}

/**
 * What's new (P013, CoachHelm): the team's CoachHelm activity of the past seven days (insights detected,
 * matured and resolved, patterns validated, focus areas started and finished), newest first and grouped by day in the
 * team's zone. Every label and time arrives already formatted by the server, so nothing here reads the clock or the
 * viewer's zone (the Fairway feed threw React #418 on exactly that). Each row opens the player it is about.
 */
export function WhatsNew({ data: fresh }: { data: ChWhatsNew }) {
  const phone = useChPhone();
  const { refresh, refreshing } = useRefresh();
  // A refresh that fails keeps the week the coach was reading and says it may be out of date; a first load that fails is the error as it came.
  const { value: data, stale } = useLastGood('whats-new', fresh, landed);
  const [filter, setFilter] = useChSessionState<Filter>('filter', 'all');

  const days = useMemo(
    () => (filter === 'all' ? data.days : data.days.map((d) => ({ ...d, items: d.items.filter((i) => i.kind === filter) })).filter((d) => d.items.length > 0)),
    [data.days, filter],
  );
  const c = data.counts;
  const nothing = !data.error && data.total === 0;

  return (
    <main className={'ch-rd ch-wn' + (phone ? ' is-phone' : '')} aria-labelledby="ch-wn-title" aria-busy={refreshing || undefined} data-canopy={phone ? undefined : ''}>
      {phone && <PhoneTop start heading={false} title="What’s new" />}
      <header className="ch-rd-h" data-canopy-head={phone ? undefined : ''}>
        <div>
          <span className="ch-rd-k">{data.total ? `Past 7 days · ${plural(data.total, 'update')}` : 'Past 7 days'}</span>
          <span className="ch-rd-upd" role="status" data-ch-code={refreshing ? 'CH-13431' : undefined}>
            {refreshing ? 'Updating…' : ''}
          </span>
          <LargeTitle id="ch-wn-title">What’s new</LargeTitle>
        </div>
      </header>

      {stale && <InlineNotice code="CH-13230" title="This week may be out of date" body="We couldn’t refresh it just now. This is what loaded last time." onRetry={refresh} retrying={refreshing} />}

      {data.error ? (
        <InlineNotice code="CH-13231" title="What’s new didn’t load" body="Nothing is lost. The activity is still saved; try again in a moment." onRetry={refresh} retrying={refreshing} />
      ) : nothing ? (
        <EmptyState size="page" code="CH-13330" icon={Sparkles} title="Nothing new this week" body="New insights, validated patterns and focus areas for your team show up here as they happen." />
      ) : (
        <SectionBoundary surface="whatsnew.feed" label="What’s new" code="CH-13232">
          <div className="ch-rd-tools">
            <Segmented
              redraws
              label="Show"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${c.all}` },
                { value: 'insights', label: `Insights ${c.insights}` },
                { value: 'patterns', label: `Patterns ${c.patterns}` },
                { value: 'focus', label: `Focus areas ${c.focus}` },
              ]}
            />
          </div>
          {days.length === 0 ? (
            <EmptyState code="CH-13331" kind="filtered" compact title="Nothing of this kind this week" body="Pick All to see the rest of the week." />
          ) : (
            <Days days={days} />
          )}
          {data.truncated && (
            <p className="ch-rd-unscored" data-ch-code="CH-13332">
              Older updates from earlier in the week may be missing.
            </p>
          )}
        </SectionBoundary>
      )}
    </main>
  );
}
