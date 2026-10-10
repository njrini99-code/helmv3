'use client';

import { AnimatePresence } from 'motion/react';
import { Check, ChevronDown, ChevronRight, GraduationCap, Mail, Phone, Plus } from 'lucide-react';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { CH_STAGES, mailHref, rowLineOf, subtitleOf, telHref, type ChProspect, type ChStage } from '../../data/recruiting-shape';
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
import { Swap } from '../../ui/Swap';
import { EmptyState } from '../../ui/States';
import type { RecCtx } from './ctx';
import { Documents } from './Documents';
import { CalendarLine, CommitRule, ContactHint, ContactSection, MetaLine, NextStepPlate, NextStepSection, NotesSection, ProspectAvatar, StageChip, isStrong } from './parts';
import { Pipeline } from './Pipeline';
import { NoMatch } from './RecruitingDesktop';
import { RecPickSheet } from './RecSheet';

/**
 * Recruiting on the phone (owner boards PhoneList, PhoneDetail, PhoneStage and the states; spec
 * docs/clubhouse/phone/recruiting.md): the list with the compact timeline, a prospect as a pushed screen with
 * Stage as a full-width row and Email and Call as two smaller actions under it (P014 finding #8), and the stage
 * picker as a sheet that saves on pick. The same data, writes and
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
        {!c.error && !nothing && <CalendarLine c={c} phone />}
        {c.error ? (
          <InlineNotice code="CH-14201" title="Your prospects didn’t load" body="Nothing was lost. Check your connection and try again." onRetry={c.tryAgain} />
        ) : nothing ? (
          <EmptyState
            size="page"
            code="CH-14301"
            icon={GraduationCap}
            title="Your prospect list starts here"
            body="Add the golfers you’re watching and move them through Watched, Recruiting, Offered and Committed."
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
              <Pipeline compact counts={c.counts} total={c.total} stage={c.stage} onPick={c.setStage} />
            </SectionBoundary>
            {/* CH-14603: a stage picked or let go settles the list in (base in, quick out); typing a search does not. */}
            <Swap swapKey={c.stageTurn}>
              {c.rows.length === 0 ? (
                <NoMatch phone query={c.query} stage={c.stage} onClear={() => c.setQuery('')} onAll={() => c.setStage(null)} />
              ) : (
                <>
                  <div className="ch-recm-count">
                    <span className="ch-num">{c.rows.length === c.total ? `${c.total} ${c.total === 1 ? 'prospect' : 'prospects'}` : `${c.rows.length} of ${c.total}`}</span>
                    <Menu
                      label="Sort prospects"
                      align="end"
                      items={c.sorts.map((s) => ({ label: s.label, checked: c.sort === s.value, onSelect: () => c.setSort(s.value) }))}
                      trigger={(t) => (
                        <button type="button" className="ch-recm-sort" {...t}>
                          {c.sorts.find((s) => s.value === c.sort)?.label}
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
                              {c.nextStep && <NextStepPlate p={p} now={c.now} tz={c.tz} />}
                            </span>
                            <StageChip stage={p.stage} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </SectionBoundary>
                </>
              )}
            </Swap>
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
                <Detail p={c.open} c={c} picking={picking} onPickStage={() => setPicking(true)} />
              </SectionBoundary>
            </div>
          </PhoneScreen>
        )}
      </AnimatePresence>

      <StageSheet p={picking ? c.open : null} onClose={() => setPicking(false)} onPick={(p, to) => c.moveStage(p, to)} />
    </main>
  );
}

/**
 * A prospect on the phone: who, then Stage as a full-width row (the most-changed control) with Email and Call as two
 * smaller actions under it, the next step, notes, documents. The Committed moment (B1) waits while the stage sheet covers it.
 */
function Detail({ p, c, picking, onPickStage }: { p: ChProspect; c: RecCtx; picking: boolean; onPickStage: () => void }) {
  const hasContact = !!(p.email || p.phone);
  return (
    <div className="ch-recm-det">
      <div className="ch-recm-hero">
        <ProspectAvatar name={p.name} size={60} strong={isStrong(p.stage)} gilt={p.stage === 'committed'} />
        <span>
          <b>{p.name}</b>
          <span>{subtitleOf(p) || 'No class or hometown yet'}</span>
        </span>
      </div>
      <button type="button" className="ch-recm-stagerow" onClick={onPickStage}>
        <span>Stage</span>
        <StageChip stage={p.stage} />
        <Icon icon={ChevronRight} size={16} />
        <CommitRule p={p} beat={c.commitBeat} held={picking} onEnd={c.endCommitBeat} />
      </button>
      {hasContact && (
        <div className={'ch-recm-tiles' + (p.email && p.phone ? '' : ' is-one')}>
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
      )}
      {hasContact && <ContactHint hint={c.contactHint(p)} />}
      {!hasContact && <ContactSection p={p} onAdd={() => c.startEdit(p, 'email')} />}
      {c.nextStep && <NextStepSection p={p} now={c.now} tz={c.tz} onEdit={c.nextStepEditable ? () => c.startEdit(p, 'nextLabel') : undefined} />}
      <NotesSection p={p} onAdd={() => c.startEdit(p, 'notes')} />
      <Documents prospect={p} writes={c.writes} initialUpload={c.initialUpload} />
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
