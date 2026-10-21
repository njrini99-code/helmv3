'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { COACH_BOARD_HREF, type ChTrackFamily, type ChTrackRecord, type ChTrackRung } from '../../../data/coachhelm-track-record-shape';
import type { ChViewLoad } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';
import { Surface } from '../../../ui/Surface';

const LINE = 'How often the reads CoachHelm showed your team held when their players’ next rounds came in.';

/**
 * The page the Track record is drawn in: on the phone a pushed screen's bar (back to CoachHelm, "Track record"), on desktop a back
 * link above the page's own header. The main landmark is labelled by the page's title.
 */
function TrackFrame({ children }: { children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  return (
    <main className={'ch-hl ch-htr' + (phone ? ' is-phone' : '')} aria-labelledby="ch-htr-title" data-canopy={phone ? undefined : ''} data-ch-code="CH-13960">
      {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(COACH_BOARD_HREF) }} title="Track record" titleId="ch-htr-title" />}
      <header className="ch-hl-h ch-htr-h" data-canopy-head="">
        {!phone && (
          <Link className="ch-htr-back" href={COACH_BOARD_HREF}>
            <Icon icon={ChevronLeft} size={15} />
            CoachHelm
          </Link>
        )}
        <span className="ch-hl-role">Coach</span>
        {phone ? (
          <p className="ch-hl-h__t">Track record</p>
        ) : (
          <h1 id="ch-htr-title" className="ch-hl-h__t">
            Track record
          </h1>
        )}
        <p>{LINE}</p>
      </header>
      {children}
    </main>
  );
}

/** One claim level: its word, how many held of those rechecked (or "Not enough yet"), the bar with the target, and what that stands on. */
function RungRow({ r }: { r: ChTrackRung }) {
  return (
    <li className={'ch-htr-rung is-' + r.tone} data-ch-code={r.bar ? 'CH-13961' : 'CH-13962'}>
      <span className="ch-htr-rung__w">{r.word}</span>
      <b className="ch-htr-rung__l ch-num">{r.line}</b>
      {r.bar && (
        <span className="ch-htr-bar" aria-hidden="true">
          <i className="ch-htr-bar__fill" style={{ width: `${(r.bar.held / r.bar.of) * 100}%` }} />
          {r.bar.target != null && <i className="ch-htr-bar__target" style={{ left: `${r.bar.target * 10}%` }} />}
        </span>
      )}
      <span className="ch-htr-rung__s ch-num">{r.sub}</span>
    </li>
  );
}

function FamilyRow({ f }: { f: ChTrackFamily }) {
  return (
    <li className="ch-htr-fam">
      <span className="ch-htr-fam__n">{f.label}</span>
      <b className="ch-htr-fam__l ch-num">{f.line}</b>
      <span className="ch-htr-fam__s ch-num">{f.sub}</span>
    </li>
  );
}

function Ready({ d }: { d: Extract<ChTrackRecord, { state: 'ready' }> }) {
  return (
    <div className="ch-htr-body">
      <Surface id="ch-htr-prog" title="This season">
        <p className="ch-htr-prog ch-num">{d.program}</p>
        {d.unrated && <p className="ch-htr-note ch-num">{d.unrated}</p>}
      </Surface>
      <Surface id="ch-htr-rungs" title="By level" subtitle="How often reads at each level held on the next rounds. The thin line is the target.">
        <ol className="ch-htr-rungs">
          {d.rungs.map((r) => (
            <RungRow key={r.id} r={r} />
          ))}
        </ol>
      </Surface>
      <Surface id="ch-htr-corr" title="Your corrections">
        <p className="ch-htr-corr ch-num" data-ch-code="CH-13963">
          {d.corrections ?? 'Corrections are not recorded yet, so Not this and Good read are not counted here.'}
        </p>
      </Surface>
      <Surface id="ch-htr-fams" title="By family">
        <ul className="ch-htr-fams" data-ch-code="CH-13964">
          {d.families.map((f) => (
            <FamilyRow key={f.id} f={f} />
          ))}
        </ul>
      </Surface>
    </div>
  );
}

/**
 * The coach's Track record (P013, `?view=track-record`, flag `coachhelm_track_record_v1`; supercharge 02 §9, 03 §7.3): the
 * program line, the five-level strip with the target drawn as a thin line, the staff's corrections and one row per family. Read
 * only; words and counts, never a percent, and "Not enough yet" below the minimum.
 */
export function TrackRecord({ load }: { load: ChViewLoad<ChTrackRecord> }) {
  if (load.status === 'off') {
    return (
      <TrackFrame>
        <EmptyState
          size="page"
          code="CH-13965"
          kind="restricted"
          title="CoachHelm is off for your team"
          body={load.reason ? `It was turned off: “${load.reason}”. The track record comes back when CoachHelm does.` : 'The track record comes back when CoachHelm is turned on again.'}
        />
      </TrackFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <TrackFrame>
        <RefreshNotice code="CH-13966" title="The track record didn’t load" body="Nothing is lost. Your players’ reads are not affected; try again in a moment." />
      </TrackFrame>
    );
  }
  const d = load.data;
  if (d.state === 'unavailable') {
    return (
      <TrackFrame>
        <EmptyState
          size="section"
          code="CH-13967"
          title="The track record isn’t switched on yet"
          body="CoachHelm is not counting how its reads held for your team yet. Nothing is wrong with your players’ reads."
        />
      </TrackFrame>
    );
  }
  if (d.empty) {
    return (
      <TrackFrame>
        <EmptyState
          size="section"
          code="CH-13968"
          shape="rows"
          title={`No reads shown since ${d.since}`}
          body="The track record starts once CoachHelm has shown your players reads and their next rounds come in."
        />
      </TrackFrame>
    );
  }
  return (
    <TrackFrame>
      <Ready d={d} />
    </TrackFrame>
  );
}
