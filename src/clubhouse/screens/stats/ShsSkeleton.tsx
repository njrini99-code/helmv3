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
      { title: 'Short game', height: 262 },
      { title: 'Putting', height: 332 },
    ],
  },
  { name: 'Rounds', cards: [{ title: 'Round by round', height: 151 }] },
  { name: 'Development', cards: [{ title: 'Goals and focus areas', height: 182 }] },
];

const TEAM_SECTIONS: typeof SECTIONS = [
  { name: 'Overview', cards: [{ title: 'Team scoring average', height: 300, feature: true }] },
  { name: 'Team game', cards: [{ title: 'Strokes gained by leg', height: 298 }] },
  { name: 'Players', cards: [{ title: 'Who gains and loses', height: 262 }] },
];

/** The loading page: titles and section names show; meta, figure and body are bars; the switch is inert (criteria 93 to 96). */
export function ShsPlayerSkeleton() {
  return <Skeleton sections={SECTIONS} />;
}

/** Team Stats' (today's CH-4401 stays on the container). */
export function ShsTeamSkeleton() {
  return <Skeleton sections={TEAM_SECTIONS} code="CH-4401" />;
}

function Skeleton({ sections, code }: { sections: typeof SECTIONS; code?: string }) {
  return (
    <main className="ch-st is-phone ch-shs" aria-busy="true" aria-label="Loading stats" data-ch-code={code}>
      <div className="ch-shs-ctl" inert>
        <div className="ch-shs-ctl__row">
          <span className="ch-seg ch-well ch-shs-skel-seg" />
          <span className="ch-sf__open ch-shs-skel-f" />
        </div>
      </div>
      <div className="ch-shs-sheet ch-shs-is-loading">
        {sections.map((s) => (
          <section key={s.name} className="ch-shs-skel-sec">
            <h2 className="ch-shs-sech">{s.name}</h2>
            {s.cards.map((c) => (
              <div key={c.title} className={'ch-shs-card ch-shs-skel-card' + (c.feature ? ' ch-shs-feature' : '')} style={{ height: c.height }}>
                <div className="ch-shs-ah">
                  <h3>{c.title}</h3>
                  {!c.feature && <span className="ch-shs-skel ch-shs-skel--meta" aria-hidden="true" />}
                </div>
                {c.feature ? (
                  <span className="ch-shs-skel ch-shs-skel--f ch-shs-skel--blk" aria-hidden="true" />
                ) : (
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
