'use client';

import { Ellipsis, GraduationCap, Plus, SearchX, Trash2 } from 'lucide-react';
import { CH_STAGES, nextStepLine, rowLineOf, stageMeta, subtitleOf, whenLabel, type ChProspect, type ChStage } from '../../data/recruiting-shape';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Swap } from '../../ui/Swap';
import { EmptyState } from '../../ui/States';
import type { RecCtx } from './ctx';
import { Documents } from './Documents';
import { CalendarLine, CommitRule, ContactSection, MetaLine, NextStepSection, NotesSection, ProspectAvatar, StageChip, isStrong } from './parts';
import { Pipeline } from './Pipeline';

/**
 * Recruiting on desktop (design/handoff/recruiting/Main.dc.html and its states): the pipeline timeline, the
 * prospect table with its search and sort, and the open prospect's panel beside it. A failed read is never drawn as
 * an empty list (CH-14201), and first run is its own page (CH-14301).
 */
export function RecruitingDesktop({ c }: { c: RecCtx }) {
  const nothing = c.total === 0;
  return (
    <main className="ch-rec" data-canopy="" aria-labelledby="ch-rec-title" data-ch-code="CH-14904">
      <header className="ch-rec-head" data-canopy-head="">
        <div>
          <h1 id="ch-rec-title">Recruiting</h1>
          <p>Prospects you’re following, from first look to commitment.</p>
          {!c.error && !nothing && <CalendarLine c={c} />}
        </div>
        {/* One primary per screen: first run carries Add your first prospect in the page below. */}
        {(!nothing || c.error) && (
          <Button variant="primary" leftIcon={Plus} onClick={c.startAdd}>
            Add prospect
          </Button>
        )}
      </header>

      {c.error ? (
        <InlineNotice
          code="CH-14201"
          title="Your prospects didn’t load"
          body="Nothing was lost; this page just couldn’t reach them. Check your connection and try again."
          onRetry={c.tryAgain}
        />
      ) : (
        <>
          {/* With nobody yet, four empty stages say nothing the page empty doesn't: it stands alone under the head, with
              its Add first, as on the phone (states audit c2). */}
          {!nothing && (
            <SectionBoundary surface="recruiting.pipeline" label="The pipeline" code="CH-14203">
              <Pipeline counts={c.counts} total={c.total} summary={c.nextSummary} stage={c.stage} onPick={c.setStage} onShowAll={() => c.setStage(null)} />
            </SectionBoundary>
          )}
          {nothing ? (
            <EmptyState
              size="page"
              code="CH-14301"
              icon={GraduationCap}
              title="Your prospect list starts here"
              body="Add the golfers you’re watching. Keep their contact details, notes and documents in one place, and move them through Watched, Recruiting, Offered and Committed. Only coaches see this page."
              action={
                <Button variant="primary" leftIcon={Plus} onClick={c.startAdd}>
                  Add your first prospect
                </Button>
              }
            />
          ) : (
            <div className={'ch-rec-body' + (c.open ? ' has-panel' : '')}>
              <SectionBoundary surface="recruiting.list" label="The prospect list" code="CH-14203">
                <section className="ch-rec-list" aria-label="Prospects">
                  <div className="ch-rec-bar">
                    <SearchField className="ch-rec-search" value={c.query} onChange={c.setQuery} placeholder="Search" label="Search prospects" />
                    {c.rows.length > 0 && (
                      <Segmented size="sm" label="Sort prospects" value={c.sort} onChange={c.setSort} options={c.sorts.map((s) => ({ value: s.value, label: s.label }))} />
                    )}
                  </div>
                  {/* CH-14603: a stage picked or let go settles the list in (base in, quick out); typing a search does not. */}
                  <Swap swapKey={c.stageTurn}>
                    {c.rows.length === 0 ? <NoMatch query={c.query} stage={c.stage} onClear={() => c.setQuery('')} onAll={() => c.setStage(null)} /> : <ProspectTable c={c} />}
                  </Swap>
                </section>
              </SectionBoundary>
              <SectionBoundary surface="recruiting.panel" label="The prospect panel" code="CH-14203">
                {c.open && <ProspectPanel key={c.open.id} p={c.open} c={c} />}
              </SectionBoundary>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** Search or a stage that matches nothing (CH-14302), with the way back: clear the search, or look across every stage. */
export function NoMatch({ query, stage, onClear, onAll, phone = false }: { query: string; stage: ChStage | null; onClear: () => void; onAll: () => void; phone?: boolean }) {
  const q = query.trim();
  const inStage = stage ? ` in ${stageMeta(stage).label}` : '';
  const title = q ? (phone ? `No match for “${q}”${inStage}` : `No prospects match “${q}”${inStage}`) : `No prospects${inStage}`;
  const body = q
    ? phone
      ? `Try another word${stage ? ', or look across every stage' : ''}.`
      : `Search looks at names, hometowns, states, email and notes. Try another word${stage ? ', or look across every stage' : ''}.`
    : 'Nothing has reached this stage yet. Move a prospect here from their panel, or look across every stage.';
  return (
    <div className={'ch-rec-none-match' + (phone ? ' is-phone' : '')} data-ch-code="CH-14302">
      <span className="ch-rec-none-match__ic" aria-hidden="true">
        <SearchX size={20} strokeWidth={1.6} />
      </span>
      <b role="status">{title}</b>
      <span>{body}</span>
      <div className="ch-rec-none-match__a">
        {phone ? (
          <>
            {stage && (
              <Button variant="primary" onClick={onAll}>
                {q ? 'Search all stages' : 'Show all stages'}
              </Button>
            )}
            {q && <Button onClick={onClear}>Clear search</Button>}
          </>
        ) : (
          <>
            {q && <Button onClick={onClear}>Clear search</Button>}
            {stage && <Button variant={q ? 'secondary' : 'primary'} onClick={onAll}>{q ? 'Search all stages' : 'Show all stages'}</Button>}
          </>
        )}
      </div>
    </div>
  );
}

function ProspectTable({ c }: { c: RecCtx }) {
  return (
    <table className="ch-rec-tb" data-ch-code="CH-14802">
      <caption className="ch-sr-only">Prospects, {c.rows.length} shown</caption>
      <thead>
        <tr>
          <th scope="col">Prospect</th>
          <th scope="col" className="is-class">
            Class
          </th>
          <th scope="col" className="is-town">
            Hometown
          </th>
          <th scope="col">Stage</th>
          {c.nextStep && (
            <th scope="col" className="is-next">
              Next step
            </th>
          )}
          <th scope="col" className="is-when">
            Updated
          </th>
        </tr>
      </thead>
      <tbody>
        {c.rows.map((p) => {
          const on = c.open?.id === p.id;
          return (
            <tr key={p.id} className={on ? 'is-on' : undefined}>
              <th scope="row">
                <button type="button" className="ch-rec-tb__name" aria-current={on || undefined} onClick={() => c.select(p.id)}>
                  <ProspectAvatar name={p.name} size={32} />
                  <span>
                    <b>{p.name}</b>
                    <span className="ch-rec-tb__sub">{rowLineOf(p)}</span>
                  </span>
                </button>
              </th>
              <td className="is-class ch-num">{p.classYear ?? '—'}</td>
              <td className="is-town">{[p.hometown, p.state].filter(Boolean).join(', ') || '—'}</td>
              <td>
                <StageChip stage={p.stage} />
              </td>
              {c.nextStep && <td className="is-next ch-num">{nextStepLine(p, c.now, c.tz) ?? '—'}</td>}
              <td className="is-when ch-num">{whenLabel(p.updatedAt, c.now, c.tz)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The open prospect: who they are, their stage (saved the moment it is picked), contact, notes, documents. Delete sits in
 * the overflow menu beside Edit (P014 finding #3), as it sits inside Edit on the phone, not as a red link always in view.
 */
function ProspectPanel({ p, c }: { p: ChProspect; c: RecCtx }) {
  return (
    <aside className="ch-rec-panel" aria-label={p.name}>
      <div className="ch-rec-panel__top">
        <div className="ch-rec-panel__who">
          <ProspectAvatar name={p.name} size={52} strong={isStrong(p.stage)} gilt={p.stage === 'committed'} />
          <div className="ch-rec-panel__id">
            <h2>{p.name}</h2>
            <span>{subtitleOf(p) || 'No class or hometown yet'}</span>
          </div>
          <Button size="sm" onClick={() => c.startEdit(p)}>
            Edit
          </Button>
          <Menu
            label={`More for ${p.name}`}
            align="end"
            items={[{ label: 'Delete prospect', icon: Trash2, danger: true, onSelect: () => c.askDelete(p) }]}
            trigger={(t) => (
              <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={`More for ${p.name}`} {...t}>
                <Icon icon={Ellipsis} size={18} />
              </button>
            )}
          />
        </div>
        <div className="ch-rec-stage" data-ch-code="CH-14803">
          <Segmented<ChStage> label="Stage" value={p.stage} onChange={(to) => c.moveStage(p, to)} options={CH_STAGES.map((s) => ({ value: s.value, label: s.label }))} />
          <CommitRule p={p} beat={c.commitBeat} onEnd={c.endCommitBeat} />
        </div>
      </div>
      <div className="ch-rec-panel__body">
        <ContactSection p={p} onAdd={() => c.startEdit(p, 'email')} hint={c.contactHint(p)} />
        {c.nextStep && <NextStepSection p={p} now={c.now} tz={c.tz} onEdit={c.nextStepEditable ? () => c.startEdit(p, 'nextLabel') : undefined} />}
        <NotesSection p={p} onAdd={() => c.startEdit(p, 'notes')} />
        <Documents prospect={p} writes={c.writes} initialUpload={c.initialUpload} />
      </div>
      <footer className="ch-rec-panel__foot">
        <MetaLine p={p} now={c.now} tz={c.tz} />
      </footer>
    </aside>
  );
}
