'use client';

import { AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, GraduationCap, Mail, Milestone, Phone, Plus } from 'lucide-react';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { CH_SORTS, CH_STAGES, mailHref, rowLineOf, subtitleOf, telHref, type ChProspect, type ChStage } from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { PhoneTop, useBackFromMore, usePhoneStackHistory } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { InlineNotice } from '../../ui/Notices';
import { PhoneBar, PhoneIconAction, PhoneTextAction } from '../../ui/PhoneBar';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import type { RecCtx } from './ctx';
import { Documents } from './Documents';
import { ContactSection, MetaLine, NotesSection, ProspectAvatar, StageChip, isStrong } from './parts';
import { Pipeline } from './Pipeline';
import { NoMatch } from './RecruitingDesktop';
import { RecPickSheet } from './RecSheet';

/**
 * Recruiting on the phone (owner boards PhoneList, PhoneDetail, PhoneStage and the states; spec
 * docs/clubhouse/phone/recruiting.md): the list with the compact timeline, a prospect as a pushed screen with
 * Stage, Email and Call tiles, and the stage picker as a sheet that saves on pick. The same data, writes and
 * catalog as desktop (CH-14914: the phone build at 820px and below, never a shrunken desktop). Recruiting opens from More, so its
 * top bar goes back there (D-66).
 */
export function RecruitingPhone({ c }: { c: RecCtx }) {
  const backFromMore = useBackFromMore();
  const [picking, setPicking] = useState(false);
  const nothing = c.total === 0;
  // The detail is a history entry, so the iOS edge swipe and the browser's back pop it (CH-1906).
  const popTo = useCallback((level: number) => level < 1 && c.closeDetail(), [c]);
  usePhoneStackHistory(c.open ? 1 : 0, popTo);

  return (
    <main className="ch-recm" aria-label="Recruiting" data-ch-code="CH-14904">
      <PhoneTop
        title="Recruiting"
        back={{ label: 'More', onBack: backFromMore }}
        // First run and a failed read have no add button on the boards: the page's own action is the way in.
        action={!nothing && !c.error ? <PhoneIconAction icon={Plus} label="Add prospect" onClick={c.startAdd} /> : undefined}
      />
      <div className="ch-recm-page" inert={c.open ? true : undefined}>
        {/* The top bar carries the page's heading; this is the board's large title. */}
        <p className="ch-recm-title" aria-hidden="true">
          Recruiting
        </p>
        {c.error ? (
          <InlineNotice code="CH-14201" title="Your prospects didn't load" body="Nothing was lost. Check your connection and try again." onRetry={c.tryAgain} />
        ) : nothing ? (
          <EmptyState
            size="page"
            code="CH-14301"
            icon={GraduationCap}
            title="Your prospect list starts here"
            body="Add the golfers you're watching and move them through Watched, Recruiting, Offered and Committed."
            action={
              <Button variant="primary" leftIcon={Plus} onClick={c.startAdd}>
                Add your first prospect
              </Button>
            }
          />
        ) : (
          <>
            <SearchField className="ch-recm-search" value={c.query} onChange={c.setQuery} placeholder="Search" label="Search prospects" />
            <SectionBoundary surface="recruiting.pipeline" label="The pipeline" code="CH-14203">
              <Pipeline compact counts={c.counts} shares={c.shares} total={c.total} stage={c.stage} onPick={c.setStage} />
            </SectionBoundary>
            {c.rows.length === 0 ? (
              <NoMatch phone query={c.query} stage={c.stage} onClear={() => c.setQuery('')} onAll={() => c.setStage(null)} />
            ) : (
              <>
                <div className="ch-recm-count">
                  <span className="ch-num">{c.rows.length === c.total ? `${c.total} ${c.total === 1 ? 'prospect' : 'prospects'}` : `${c.rows.length} of ${c.total}`}</span>
                  <Menu
                    label="Sort prospects"
                    align="end"
                    items={CH_SORTS.map((s) => ({ label: s.label, checked: c.sort === s.value, onSelect: () => c.setSort(s.value) }))}
                    trigger={(t) => (
                      <button type="button" className="ch-recm-sort" {...t}>
                        {CH_SORTS.find((s) => s.value === c.sort)?.label}
                        <Icon icon={ChevronDown} size={15} />
                      </button>
                    )}
                  />
                </div>
                <SectionBoundary surface="recruiting.list" label="The prospect list" code="CH-14203">
                  <ul className="ch-recm-list" data-ch-code="CH-14802">
                    {c.rows.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="ch-recm-row" onClick={() => c.select(p.id)}>
                          <ProspectAvatar name={p.name} size={36} />
                          <span className="ch-recm-row__b">
                            <b>{p.name}</b>
                            <span>{rowLineOf(p) || 'No class or hometown yet'}</span>
                          </span>
                          <StageChip stage={p.stage} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </SectionBoundary>
              </>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {c.open && (
          <PhoneScreen key={`prospect-${c.open.id}`} labelledBy="ch-recm-det-title" className="ch-recm-screen" code="CH-14602">
            <PhoneBar
              back={{ label: 'Recruiting', onBack: c.closeDetail }}
              // The board shows no title in the bar; the name is the screen's heading for VoiceOver and is in the hero.
              title={<span className="ch-sr-only">{c.open.name}</span>}
              titleId="ch-recm-det-title"
              action={<PhoneTextAction onClick={() => c.startEdit(c.open!)}>Edit</PhoneTextAction>}
            />
            <div className="ch-recm-scroll">
              <SectionBoundary surface="recruiting.panel" label="The prospect" code="CH-14203">
                <Detail p={c.open} c={c} onPickStage={() => setPicking(true)} />
              </SectionBoundary>
            </div>
          </PhoneScreen>
        )}
      </AnimatePresence>

      <StageSheet p={picking ? c.open : null} onClose={() => setPicking(false)} onPick={(p, to) => c.moveStage(p, to)} />
    </main>
  );
}

/** A prospect on the phone: who, then Stage with Email and Call as tiles (a Stage row when there is no contact), notes, documents. */
function Detail({ p, c, onPickStage }: { p: ChProspect; c: RecCtx; onPickStage: () => void }) {
  const hasContact = !!(p.email || p.phone);
  return (
    <div className="ch-recm-det">
      <div className="ch-recm-hero">
        <ProspectAvatar name={p.name} size={60} strong={isStrong(p.stage)} />
        <span>
          <b>{p.name}</b>
          <span>{subtitleOf(p) || 'No class or hometown yet'}</span>
        </span>
      </div>
      {hasContact ? (
        <div className={'ch-recm-tiles' + (p.email && p.phone ? '' : ' is-two')}>
          <button type="button" className={`ch-recm-tile is-stage is-${p.stage}`} onClick={onPickStage}>
            <Icon icon={Milestone} size={18} />
            {CH_STAGES.find((s) => s.value === p.stage)?.label}
            <span className="ch-sr-only">. Change stage</span>
          </button>
          {p.email && (
            <a className="ch-recm-tile" href={mailHref(p.email)}>
              <Icon icon={Mail} size={18} />
              Email
            </a>
          )}
          {p.phone && (
            <a className="ch-recm-tile" href={telHref(p.phone)}>
              <Icon icon={Phone} size={18} />
              Call
            </a>
          )}
        </div>
      ) : (
        <button type="button" className="ch-recm-stagerow" onClick={onPickStage}>
          <span>Stage</span>
          <StageChip stage={p.stage} />
          <Icon icon={ChevronRight} size={16} />
        </button>
      )}
      {!hasContact && <ContactSection p={p} onAdd={() => c.startEdit(p, 'email')} />}
      <NotesSection p={p} onAdd={() => c.startEdit(p, 'notes')} />
      <Documents prospect={p} writes={c.writes} />
      <MetaLine p={p} now={c.now} tz={c.tz} />
    </div>
  );
}

/** The stage picker (PhoneStage board): four rows, the current one ticked, each saved as it is picked; Done closes. */
function StageSheet({ p, onClose, onPick }: { p: ChProspect | null; onClose: () => void; onPick: (p: ChProspect, to: ChStage) => void }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d || !p) return;
    e.preventDefault();
    const i = CH_STAGES.findIndex((s) => s.value === p.stage);
    const next = CH_STAGES[(i + d + CH_STAGES.length) % CH_STAGES.length]!;
    onPick(p, next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-stage="${next.value}"]`)?.focus();
  };
  return (
    <RecPickSheet open={!!p} onClose={onClose} title="Stage" note="Saves as soon as you pick. Players never see this.">
      {p && (
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the radios inside are the tab stops; the group only routes arrow keys
        <div className="ch-recm-stages" role="radiogroup" aria-label={`Stage for ${p.name}`} onKeyDown={onKey}>
          {CH_STAGES.map((s) => {
            const on = p.stage === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-stage={s.value}
                className="ch-recm-stages__row"
                onClick={() => {
                  if (!on) haptic('select');
                  onPick(p, s.value);
                }}
              >
                <span className="ch-recm-stages__t">
                  <StageChip stage={s.value} size="lg" />
                  <span>{s.blurb}</span>
                </span>
                {on && <Icon icon={Check} size={18} />}
              </button>
            );
          })}
        </div>
      )}
    </RecPickSheet>
  );
}
