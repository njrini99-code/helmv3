import type { ReactNode } from 'react';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';
import { SkelLine, Skeleton } from '../../ui/States';
import { PlanSheetSkeleton } from '../coachhelm/plan/sheet/PlanSheetSkeleton';
import { PLAN_STARTERS } from './starters';

/**
 * Route loading for Practice: each page in waiting is the loaded page's own boxes (its classes, so its gutters, columns and card
 * surfaces are the page's) with the shared bars inside, each line at the loaded line's height. Nothing moves when the page lands
 * (measured in WebKit at 390 and 1440 against the preview's pages, 2026-11-11). A part only one width has is drawn for both and
 * practice.css shows the one for the width (`.ch-prc-sk-desk`, `.ch-prc-sk-phone`), so the server needs no width to draw it.
 *
 * No stylesheet is imported here: this module is drawn from a client component, and a sheet imported on that side lands ahead of
 * the shared sheets, where `.ch-pills` then beat `.ch-prc-areas` and a phone's areas wrapped. The route's loading files import
 * the two sheets on the server, in the order the pages do.
 */

const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The head: the title's one line, the line under it, and on a Mac the page's keys at their loaded sizes. */
function Head({ title, line, keys }: { title: { phone: number; desk: number }; line?: number; keys?: number[] }) {
  return (
    <header className="ch-prc-h" aria-hidden="true">
      <div>
        <LargeTitleSkeleton width={title.phone} className="ch-prc-sk-title" />
        <span className="ch-prc-sk-desk">
          <SkelLine line={47.5} bar={36} width={title.desk} />
        </span>
        {line != null && (
          <p className="ch-prc-h__line">
            <SkelLine line={20} bar={12} width={line} />
          </p>
        )}
      </div>
      {keys && (
        <div className="ch-prc-h__a ch-prc-sk-desk">
          {keys.map((w, i) => (
            <Skeleton key={i} width={w} height={36} radius={12} />
          ))}
        </div>
      )}
    </header>
  );
}

/** Plans · Drills · Groups · Templates in waiting: the well at its loaded size, hugging its labels on a Mac and the page's width on a phone. */
function Tabs({ only }: { only?: 'desk' | 'phone' }) {
  return (
    <>
      {only !== 'phone' && (
        <div className="ch-prc-tabs ch-prc-sk-desk" aria-hidden="true">
          <Skeleton width={319} height={38} radius={16} />
        </div>
      )}
      {only !== 'desk' && (
        <div className="ch-prc-tabs ch-prc-sk-phone" aria-hidden="true">
          <Skeleton width="100%" height={44} radius={16} />
        </div>
      )}
    </>
  );
}

/** This week: seven tiles, each with its day and one practice (the time, then its state). */
function Week() {
  return (
    <div className="ch-prc-week" aria-hidden="true">
      {DAYS.map((d) => (
        <div key={d} className="ch-prc-tile">
          <span className="ch-prc-tile__d ch-prc-sk-mid">
            <SkelLine line={22} bar={11} width={26} />
            <Skeleton width={10} height={14} radius={4} />
          </span>
          <span className="ch-prc-tile__it">
            <SkelLine line={18} bar={11} width={50} />
            <Skeleton width={56} height={22} radius={4} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A plan's row: its name and state, its day and time, its first blocks. */
function Row({ i }: { i: number }) {
  return (
    <li>
      <span className="ch-prc-row">
        <span className="ch-prc-row__m">
          <span className="ch-prc-row__top">
            <SkelLine line={20} bar={13} width={132 + (i % 2) * 28} />
            <Skeleton width={58} height={22} radius={4} />
          </span>
          <SkelLine line={18} bar={11} width="62%" />
          <SkelLine line={18} bar={11} width="78%" />
        </span>
      </span>
    </li>
  );
}

/** A section of plans: its heading, then its rows on one card. */
function Plans({ rows }: { rows: number }) {
  return (
    <section className="ch-prc-sec" aria-hidden="true">
      <div>
        <SkelLine line={20} bar={13} width={84} />
      </div>
      <ul className="ch-prc-rows">
        {Array.from({ length: rows }, (_, i) => (
          <Row key={i} i={i} />
        ))}
      </ul>
    </section>
  );
}

/** Practice, the coach's tab, in waiting: the head and its keys, the week, the tabs, Up next with a plan of four blocks, then the plans. */
export function PracticeHomeSkeleton() {
  return (
    <main className="ch-page ch-prc" data-ch="practice" aria-busy="true" aria-label="Loading practice">
      <Head title={{ phone: 106, desk: 137 }} line={161} keys={[108, 115]} />
      <section aria-hidden="true">
        <Week />
      </section>
      <Tabs only="desk" />
      <div className="ch-prc-home has-plans">
        <section className="ch-prc-card ch-prc-next" aria-hidden="true">
          <div className="ch-prc-next__k">
            <SkelLine line={18} bar={11} width={47} />
            <Skeleton width={57} height={22} radius={4} />
          </div>
          <div className="ch-prc-sk-next">
            <SkelLine line={28} bar={18} width="52%" />
          </div>
          {/* The day, the time and the place: three facts that wrap whole, as the loaded line's do on a narrow phone. */}
          <p className="ch-prc-next__w ch-prc-sk-facts">
            {[72, 107, 127].map((w) => (
              <SkelLine key={w} line={20} bar={12} width={w} />
            ))}
          </p>
          <div className="ch-prc-day">
            <Skeleton width="100%" height={8} radius={4} />
          </div>
          {/* The strip's key, a word and its minutes a kind: it wraps where the loaded key does. */}
          <div className="ch-prc-sk-mix">
            {[85, 113, 116].map((w) => (
              <SkelLine key={w} line={19} bar={10} width={w} />
            ))}
          </div>
          <ol className="ch-prc-next__rows">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <SkelLine line={20} bar={12} width={30} />
                <SkelLine line={20} bar={13} width={`${34 + ((i * 17) % 30)}%`} />
                <SkelLine line={18} bar={11} width={`${22 + ((i * 11) % 18)}%`} />
              </li>
            ))}
          </ol>
          <p className="ch-prc-next__more">
            <SkelLine line={19} bar={11} width={118} />
          </p>
          <div className="ch-prc-next__a">
            <Skeleton width={121} height={36} radius={12} />
          </div>
        </section>
        <Tabs only="phone" />
        <div className="ch-prc-home__plans">
          <Plans rows={2} />
        </div>
      </div>
      {/* Plan format, the phone's last row. */}
      <div className="ch-prc-open ch-prc-sk-phone ch-prc-sk-still" aria-hidden="true">
        <SkelLine line={20} bar={12} width={84} />
      </div>
    </main>
  );
}

/** One stop on the player's card: the clock, the place, what is done there. */
function Stop({ i }: { i: number }) {
  return (
    <div className="stop">
      <span className="tm">
        <SkelLine line={20} bar={12} width={30} />
      </span>
      <div>
        <div className="pl">
          <SkelLine line={21} bar={13} width={`${38 + ((i * 13) % 24)}%`} />
        </div>
        <div className="dr">
          <SkelLine line={20} bar={11} width={`${56 + ((i * 9) % 22)}%`} />
        </div>
      </div>
      <span />
    </div>
  );
}

/** The player's practice card: the plan's name and time, its focus (one line on a Mac, two on a phone) and their group. */
function PlayerCard() {
  return (
    <section className="art" aria-hidden="true">
      <header className="art-h">
        <Skeleton width={32} height={32} radius={8} />
        <div className="hd">
          <span className="t">
            <SkelLine line={22} bar={14} width="54%" />
          </span>
          <span className="m">
            <SkelLine line={20} bar={11} width="78%" />
          </span>
        </div>
      </header>
      {/* On a Mac the loaded card on Practice is as wide as its longest line, so the focus is drawn at a sentence's length (62 characters). */}
      <div className="focus">
        <span className="ch-prc-sk-desk">
          <SkelLine line={21} bar={12} width={494} />
        </span>
        <span className="ch-prc-sk-phone">
          <SkelLine line={21} bar={12} width="92%" />
          <SkelLine line={21} bar={12} width="48%" />
        </span>
      </div>
      <div className="grpl">
        <Skeleton width={72} height={24} radius={12} />
        <SkelLine line={20} bar={12} width={182} />
      </div>
    </section>
  );
}

/** Practice, the player's tab, in waiting: their next practice (the card, three stops and Open plan), the week, then their plans. */
export function PlayerPracticeHomeSkeleton() {
  return (
    <main className="ch-page ch-prc" data-ch="practice" aria-busy="true" aria-label="Loading practice">
      <Head title={{ phone: 106, desk: 137 }} line={64} />
      <div className="ch-cpv ch-cpv-ply ch-prc-today" aria-hidden="true">
        <PlayerCard />
        <section className="art">
          {[0, 1, 2].map((i) => (
            <Stop key={i} i={i} />
          ))}
        </section>
        <Skeleton width="100%" height={36} radius={12} />
      </div>
      <section className="ch-prc-sec" aria-hidden="true">
        <div>
          <SkelLine line={20} bar={13} width={74} />
        </div>
        <Week />
      </section>
      <Plans rows={1} />
    </main>
  );
}

const TITLE = { drills: { phone: 64, desk: 83 }, groups: { phone: 94, desk: 122 }, templates: { phone: 134, desk: 172 } } as const;
/** The head's one key on a Mac (New drill, New group); Templates has none. */
const KEY = { drills: [111], groups: [126], templates: undefined } as const;

/**
 * A drill in waiting: its name, then its facts. On a Mac it is a card on the shelf, three across, and a team's card holds a
 * third line (its levels) as the tallest in its row does. A GolfHelm drill carries its mark beside the name instead.
 */
function Drill({ i, lib = false }: { i: number; lib?: boolean }) {
  return (
    <li>
      <span className="ch-prc-row">
        <span className="ch-prc-row__m">
          <span className="ch-prc-row__top">
            <SkelLine line={20} bar={13} width={(lib ? 96 : 118) + (i % 3) * 12} />
            {lib && <Skeleton width={70} height={22} radius={4} />}
          </span>
          <SkelLine line={18} bar={11} width="74%" />
          {!lib && (
            <span className="ch-prc-sk-desk">
              <SkelLine line={18} bar={11} width="58%" />
            </span>
          )}
        </span>
      </span>
    </li>
  );
}

/** An area's pill at its loaded height: 30 on a Mac, 36 on a phone. */
function Pill({ width }: { width: number }) {
  return (
    <>
      <span className="ch-prc-sk-desk">
        <Skeleton width={width} height={30} radius={15} />
      </span>
      <span className="ch-prc-sk-phone">
        <Skeleton width={width} height={36} radius={18} />
      </span>
    </>
  );
}

/** A group in waiting: its name, its faces, its count. */
function GroupCard() {
  return (
    <li>
      <span className="ch-prc-gcard ch-prc-sk-still">
        <SkelLine line={21} bar={13} width="48%" />
        <Skeleton width={136} height={24} radius={12} />
        <SkelLine line={18} bar={11} width={60} />
      </span>
    </li>
  );
}

/** A phone's line holds about this many characters of a starter's sentence; a longer one takes a second line there. */
const PHONE_LINE = 52;

/**
 * A template in waiting: its name, its kind, its sentence and its first blocks. `sentence`: 0 for none (a team's own template),
 * 1 for one line, 2 for a sentence that takes a second line on a phone; on a Mac a card is narrow, so every sentence takes two.
 */
function TemplateCard({ sentence, blocks }: { sentence: 0 | 1 | 2; blocks: number }) {
  return (
    <li className="ch-prc-card ch-prc-tmpl">
      <span className="ch-prc-tmpl__go ch-prc-sk-still">
        <SkelLine line={21} bar={13} width="62%" />
        <SkelLine line={18} bar={11} width={96} />
        {sentence > 0 && (
          <small>
            <SkelLine line={18} bar={11} width="96%" />
            <span className={sentence === 2 ? undefined : 'ch-prc-sk-desk'}>
              <SkelLine line={18} bar={11} width="64%" />
            </span>
          </small>
        )}
        <span className="ch-prc-glance">
          {[72, 58, 66].slice(0, blocks).map((w) => (
            <SkelLine key={w} line={18} bar={11} width={`${w}%`} />
          ))}
        </span>
      </span>
    </li>
  );
}

/** The library in waiting (Drills, Groups, Templates): the head and its key, the tabs, then the tab's own shelf. */
export function PracticeLibrarySkeleton({ tab }: { tab: 'drills' | 'groups' | 'templates' }) {
  let body: ReactNode;
  if (tab === 'drills') {
    body = (
      <>
        <div className="ch-prc-find" aria-hidden="true">
          <Skeleton width="100%" height={36} radius={12} />
          <div className="ch-pills ch-prc-areas">
            {[40, 69, 95, 67, 84, 46, 68, 68, 66].map((w, i) => (
              <Pill key={i} width={w} />
            ))}
          </div>
        </div>
        <section className="ch-prc-sec" aria-hidden="true">
          <div>
            <SkelLine line={20} bar={13} width={78} />
          </div>
          <ul className="ch-prc-list is-drills">
            {[0, 1, 2].map((i) => (
              <Drill key={i} i={i} />
            ))}
          </ul>
        </section>
        <section className="ch-prc-sec" aria-hidden="true">
          <div>
            <SkelLine line={20} bar={13} width={106} />
          </div>
          <ul className="ch-prc-list is-drills">
            {[0, 1, 2].map((i) => (
              <Drill key={i} i={i} lib />
            ))}
          </ul>
        </section>
      </>
    );
  } else if (tab === 'groups') {
    body = (
      <ul className="ch-prc-cards" aria-hidden="true">
        <GroupCard />
        <GroupCard />
      </ul>
    );
  } else {
    body = (
      <>
        {/* From GolfHelm: the six starters are the app's own, so each card is drawn with its own number of lines. */}
        <section className="ch-prc-sec" aria-hidden="true">
          <div>
            <SkelLine line={20} bar={13} width={104} />
          </div>
          <ul className="ch-prc-cards">
            {PLAN_STARTERS.map((s) => (
              <TemplateCard key={s.id} sentence={s.line.length > PHONE_LINE ? 2 : 1} blocks={Math.min(3, s.body.variants.main.blocks.length)} />
            ))}
          </ul>
        </section>
        {/* Your templates: the heading with its Session · Block · Week switch, then the team's first. */}
        <section className="ch-prc-sec" aria-hidden="true">
          <div className="ch-prc-sec__h">
            <SkelLine line={20} bar={13} width={105} />
            <span className="ch-prc-sk-desk">
              <Skeleton width={204} height={34} radius={16} />
            </span>
            <span className="ch-prc-sk-phone">
              <Skeleton width={204} height={42} radius={16} />
            </span>
          </div>
          <ul className="ch-prc-cards">
            <TemplateCard sentence={0} blocks={3} />
          </ul>
        </section>
      </>
    );
  }
  return (
    <main className="ch-page ch-prc" data-ch="practice" aria-busy="true" aria-label={`Loading ${tab}`}>
      <Head title={TITLE[tab]} keys={KEY[tab] ? [...KEY[tab]] : undefined} />
      <Tabs />
      {body}
    </main>
  );
}

/**
 * A plan's page, the coach's, in waiting: on a Mac the way back, the plan's name and day, the status line with its keys, then
 * the sheet; on a phone (the bar holds the name) the status, the keys under it, then the sheet. Drawn for a published plan
 * outside its practice: Run, which stands between the status and the sheet during practice, pushes the sheet down when it comes.
 */
export function PracticePlanSkeleton() {
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan" aria-busy="true" aria-label="Loading the plan">
      <span className="ch-backlink ch-prc-sk-desk ch-prc-sk-still" aria-hidden="true">
        <SkelLine line={18} bar={12} width={70} />
      </span>
      {/* G14: the phone page opens on the plan's large title and its day, so its skeleton does, and the bar's title stays hidden from the first paint. */}
      <header className="ch-prc-h ch-prc-planhead ch-prc-sk-phone" aria-hidden="true">
        <div>
          <LargeTitleSkeleton width={220} className="ch-prc-sk-title" />
          <p className="ch-prc-h__line">
            <SkelLine line={20} bar={12} width={200} />
          </p>
        </div>
      </header>
      <header className="ch-prc-h ch-prc-planhead ch-prc-sk-desk" aria-hidden="true">
        <div>
          <SkelLine line={47.5} bar={36} width={379} />
          <p className="ch-prc-h__line">
            <SkelLine line={20} bar={12} width={340} />
          </p>
        </div>
      </header>
      <section className="ch-prc-planbar" aria-hidden="true">
        <div className="ch-prc-planbar__s">
          <Skeleton width={84} height={22} radius={4} />
          <span className="ch-prc-sk-desk">
            <SkelLine line={19} bar={12} width={140} />
          </span>
          {/* Seen by is words with no surface, so it waits as a line of words in the key's box. */}
          <span className="ch-prc-sk-end">
            <SkelLine line={30} bar={12} width={84} />
          </span>
        </div>
        <div className="ch-prc-planbar__a ch-prc-sk-desk">
          {[81, 87, 93].map((w) => (
            <Skeleton key={w} width={w} height={36} radius={12} />
          ))}
        </div>
      </section>
      <div className="ch-prc-planbar__a ch-prc-sk-phone" aria-hidden="true">
        <Skeleton height={36} radius={12} />
        <Skeleton height={36} radius={12} />
      </div>
      <PlanSheetSkeleton />
    </main>
  );
}

/** A plan's page, the player's, in waiting: Practice and its day, their card, the switch between their practice and the sheet, then their stops. */
export function PlayerPracticePlanSkeleton() {
  return (
    <main className="ch-page ch-cpv ch-cpv-ply" data-ch="player-practice" aria-busy="true" aria-label="Loading your practice">
      <LargeTitleSkeleton width={106} className="ch-prc-sk-title" />
      <span className="ch-large-title ch-prc-sk-desk" aria-hidden="true">
        <SkelLine line={47.5} bar={36} width={137} />
      </span>
      <p className="ctx" aria-hidden="true">
        <SkelLine line={20} bar={12} width={64} />
      </p>
      <PlayerCard />
      <span className="ch-prc-sk-desk" aria-hidden="true">
        <Skeleton width="100%" height={38} radius={16} />
      </span>
      <span className="ch-prc-sk-phone" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={16} />
      </span>
      <section className="art" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Stop key={i} i={i} />
        ))}
      </section>
    </main>
  );
}
