'use client';

import { Avatar } from '../../ui/Avatar';
import { InlineNotice } from '../../ui/Notices';
import { Section } from '../../ui/Section';
import { EmptyState, SkelRows, Skeleton } from '../../ui/States';
import { useRefresh } from '../../lib/use-refresh';
import { andList, tourRange } from './format';
import { TourCrumb, TourFailed, TourHead, TourLoading, TourMain, TourPhoneTop, tourGate, useTourPhone } from './parts';
import { useTourPaths } from './paths';
import type { ChTourReviewData, ReviewProps } from './types';
import '../../styles/tournaments-review.css';

const TITLE_ID = 'ch-tour-rev-title';
const LINE = 'What the rounds show, what each rests on, and what might explain it.';
const KIND = { coach: 'Coach note', reflection: 'Player reflection' } as const;

/**
 * An event's review (board `Review`): what the rounds show as layers (an observation, the evidence under it, then a
 * possible reason, said as only possible), and the notes and reflections that came with them. Coach only. It is the page's
 * own view, and the desk's Review tab (`embedded`: no head, no page root). The leak table, the per-player debrief lines and
 * Make it a focus have no board and are not drawn.
 */
export function Review({ data, load, phone: forced, embedded = false }: ReviewProps) {
  const phone = useTourPhone(forced);
  const e = data.event;
  if (embedded) {
    return (
      <div className={'ch-tour-rev' + (phone ? ' is-phone' : '')} data-ch-tour-view="review">
        {tourGate(load, {
          loading: () => (
            <div aria-busy="true" aria-label="Loading the review" data-ch-code="CH-16401">
              <Skeleton width="100%" height={160} radius={16} shape="solid" />
            </div>
          ),
          failed: () => <EmptyState size="page" tone="danger" code="CH-16201" title="Tournaments didn’t load" body="Nothing is lost. Your events and scores are still saved; try again in a moment." />,
          ready: () => <ReviewBody data={data} phone={phone} />,
        })}
      </div>
    );
  }
  return tourGate(load, {
    loading: () => (
      <TourLoading view="review" phone={phone} title="Review" className="ch-tour-rev">
        <Skeleton width="100%" height={phone ? 160 : 180} radius={16} shape="solid" />
        <SkelRows rows={3} lead />
      </TourLoading>
    ),
    failed: () => <TourFailed view="review" phone={phone} id={TITLE_ID} eyebrow={e.name} title="Review" className="ch-tour-rev" />,
    ready: () => <ReviewPage data={data} phone={phone} />,
  });
}

function ReviewPage({ data, phone }: { data: ChTourReviewData; phone: boolean }) {
  const paths = useTourPaths();
  const e = data.event;
  return (
    <TourMain view="review" phone={phone} labelledBy={TITLE_ID} className={'ch-tour-rev'}>
      <TourPhoneTop phone={phone} title="Review" back={{ label: e.short, href: paths.desk(e.id) }} />
      <TourHead id={TITLE_ID} phone={phone} crumb={<TourCrumb href={paths.desk(e.id)}>{e.name}</TourCrumb>} eyebrow={`${tourRange(e.startDate, e.endDate)} · ${e.name}`} title="Review" line={LINE} tight />
      <ReviewBody data={data} phone={phone} />
    </TourMain>
  );
}

/** The review’s sections, shared by the page and the desk’s tab. */
export function ReviewBody({ data, phone }: { data: ChTourReviewData; phone: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const r = data.review;
  if (data.errors.review)
    return <InlineNotice code="CH-16235" title="The review didn’t load" body="Nothing has changed. Try again; the error has been reported." onRetry={refresh} retrying={refreshing} />;
  if (!r) return <EmptyState compact code="CH-16336" title="Nothing to review yet" body="The review is written once the event has scores." />;
  if (!r.open) return <EmptyState compact code="CH-16335" title="The review opens when every round is final" body="Until then the scores can still change, so nothing is concluded from them." />;
  const missing = r.missingReflections.map((id) => data.players.find((p) => p.id === id)?.first ?? '').filter(Boolean);
  const names = andList(missing);
  return (
    <div className="ch-tour-rev-body">
      <Section id="ch-tour-rev-layers" title="What the rounds show" meta="Observation, evidence, then a possible explanation">
        <div className="ch-tour-rev-layers">
          {r.layers.map((l) => (
            <article key={l.id} className="ch-tour-rev-layer">
              <dl>
                <div>
                  <dt>Observation</dt>
                  <dd>{l.observation}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd className="ch-tour-rev-layer__ev">{l.evidence}</dd>
                </div>
                <div className="is-hyp">
                  <dt>Possible reason</dt>
                  <dd>{l.hypothesis}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Section>
      <Section id="ch-tour-rev-notes" title="Notes and reflections" meta="Private to coaches until you share">
        {r.notes.length === 0 ? (
          <EmptyState compact code="CH-16337" title="No notes or reflections yet" body="A coach’s note or a player’s reflection shows here once it is written." />
        ) : (
          <ul className="ch-tour-rev-notes">
            {r.notes.map((n) => (
              <li key={n.id} className="ch-tour-rev-note">
                <div className="ch-tour-rev-note__w">
                  {!phone && <Avatar name={n.author} size={28} />}
                  <div>
                    <div className="ch-tour-rev-note__n">{n.author}</div>
                    <div className="ch-tour-rev-note__k">{KIND[n.kind]}</div>
                  </div>
                </div>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        )}
        {missing.length > 0 && <p className="ch-tour-rev-missing">{names} {missing.length === 1 ? 'hasn’t' : 'haven’t'} added {missing.length === 1 ? 'a reflection' : 'reflections'}.</p>}
      </Section>
    </div>
  );
}
