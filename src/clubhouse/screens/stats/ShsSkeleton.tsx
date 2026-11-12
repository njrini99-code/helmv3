import { TERMS } from '../../lib/glossary';
import { filterFor, hasRange, rangeOf, type ChFilter } from '../../data/stats-filter';
import { WindowSwitch } from './WindowSwitch';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';
import '../../styles/stats-redesign.css';

/** Each card keeps its loaded height (06 S-STATS loading, 393 wide), so nothing shifts as the page lands (08 criterion 93). */
const SECTIONS: ReadonlyArray<{ name: string; cards: ReadonlyArray<{ title: string; height: number; feature?: boolean }> }> = [
  {
    name: 'Overview',
    cards: [
      { title: 'Scoring average', height: 342, feature: true },
      { title: 'What changed', height: 193 },
      { title: 'At a glance', height: 237 },
    ],
  },
  {
    name: 'Your game',
    cards: [
      { title: 'Strokes gained', height: 323 },
      { title: 'Off the tee', height: 256 },
      { title: 'Approach', height: 413 },
      { title: TERMS.shortGame.long, height: 262 },
      { title: 'Putting', height: 332 },
    ],
  },
  { name: 'Rounds', cards: [{ title: 'Round by round', height: 151 }] },
  { name: 'Development', cards: [{ title: 'Goals and focus areas', height: 182 }] },
];

const TEAM_SECTIONS: typeof SECTIONS = [
  { name: 'Overview', cards: [{ title: 'Scoring average', height: 300, feature: true }] },
  { name: 'Team game', cards: [{ title: 'Strokes gained by leg', height: 298 }] },
  { name: 'Players', cards: [{ title: 'Who gains and loses', height: 262 }] },
];

/**
 * The loading page: the real switch on the choice the address names, held still; titles and section names show; meta, figure and body
 * are bars; the green card is plain (criteria 93 to 96).
 */
export function ShsPlayerSkeleton({ filter, coach = false }: { filter?: ChFilter; /** A coach waiting on a player's page: the game is not theirs, and the player's name is not known yet. */ coach?: boolean }) {
  return <Skeleton sections={coach ? SECTIONS.map((s) => (s.name === 'Your game' ? { ...s, name: 'Game' } : s)) : SECTIONS} filter={filter} head={coach} />;
}

/** Team Stats' (today's CH-4401 stays on the container). */
export function ShsTeamSkeleton({ filter }: { filter?: ChFilter }) {
  return <Skeleton sections={TEAM_SECTIONS} code="CH-4401" filter={filter} />;
}

const still = () => {};

function Skeleton({ sections, code, filter = filterFor(), head = false }: { sections: typeof SECTIONS; code?: string; filter?: ChFilter; /** A coach's view of a player opens with the player's head (the avatar, the name as the page's large title, the facts): its block stands here so the switch and the cards do not drop 85px when the page lands. */ head?: boolean }) {
  return (
    <main className="ch-st is-phone ch-shs" aria-busy="true" aria-label="Loading stats" data-ch-code={code}>
      {head && (
        <div className="ch-shs-skel-head" aria-hidden="true">
          <span className="ch-shs-skel ch-shs-skel--av" />
          <span className="ch-shs-skel-head__id">
            <LargeTitleSkeleton width={170} />
            <span className="ch-shs-skel-head__facts">
              <span className="ch-shs-skel" />
            </span>
          </span>
        </div>
      )}
      <div className="ch-shs-ctl" inert>
        <div className="ch-shs-ctl__row">
          {/* The control is known before the figures are: it is drawn as itself, so nothing changes shape when they land. */}
          <WindowSwitch value={rangeOf(filter)} span={filter.span ?? 'season'} onScope={still} custom={hasRange(filter)} />
          <span className="ch-sf__open ch-shs-skel-f" />
        </div>
      </div>
      <div className="ch-shs-sheet ch-shs-is-loading">
        {sections.map((s) => (
          <section key={s.name} className="ch-shs-skel-sec">
            <h2 className="ch-shs-sech">{s.name}</h2>
            {s.cards.map((c) => (
              <div key={c.title} className={'ch-shs-card ch-shs-skel-card' + (c.feature ? ' ch-shs-feature' : '')} style={{ height: `calc(${c.height} * var(--ch-type-k))` }}>
                <div className="ch-shs-ah">
                  <h3>{c.title}</h3>
                  {!c.feature && <span className="ch-shs-skel ch-shs-skel--meta" aria-hidden="true" />}
                </div>
                {/* The green card waits plain: no bar, no sheen on the green. */}
                {c.feature ? null : (
                  <>
                    <span className="ch-shs-skel ch-shs-skel--v" aria-hidden="true" />
                    <span className="ch-shs-skel ch-shs-skel--blk" aria-hidden="true" />
                  </>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
