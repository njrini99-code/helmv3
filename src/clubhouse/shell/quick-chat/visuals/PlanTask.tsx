'use client';

import { Button } from '../../../ui/Button';

import { Badge } from '../../../../clubhouse/ui/Badge';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { safeSave } from '../../../screens/coachhelm/plan/safe-save';
import { squashFolder } from '../../../screens/coachhelm/chat/ask-flight';
import { listPlanFolders, savePracticePlanDraft, undoPracticePlanDraft } from '@/app/golf/actions/coachhelm-practice-plans';
import type { PlanPartData } from '../../../screens/coachhelm/plan/PlanCard';
import { useUndoWindow } from '../../../screens/coachhelm/plan/useUndoWindow';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useQcSeam } from '../qc-seam';
import { taskIn } from '../task-motion';

const DEFAULT = 'Practice plans';
const NAME_MAX = 60;
const SEG = ['a', 'b', 'c'] as const;
const SWATCH = ['var(--ch-qc-a-seg1)', 'var(--ch-qc-a-seg2)', 'var(--ch-qc-a-seg3)'];
const CLIPBOARD = 'M9 4h6v3H9zM8 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H16M9 12h6M9 16h4';
const FOLDER = 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z';
const Ico = ({ d, className }: { d: string; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

type Phase = { k: 'draft' | 'busy' | 'undone' | 'cancelled' } | { k: 'failed'; reason: string } | { k: 'saved'; planId: string; created: boolean; savedAt: string; until: string; folder: string };

/**
 * S-TASK.plan: the plan as the quick chat's task card. Time bar in proportion to the minutes, blocks, facts, "Save to" with its in-card list, and Save plan through the same
 * action as Ask. Off by its flags the card is inert and calls nothing. Quick chat never publishes (DECISIONS); Publish lives on the plan page.
 */
export function PlanTask({ plan, online, onOpen }: { plan: PlanPartData; online: boolean; onOpen: (href: string) => void }) {
  const seam = useQcSeam();
  const preview = seam?.plan ?? null;
  const reduced = useChReducedMotion();
  const card = useRef<HTMLElement>(null);
  const saveOn = !!plan.saveOn;
  const blocks = plan.draft.body.variants.main.blocks;
  const total = blocks.reduce((s, b) => s + b.len, 0);
  const place = plan.draft.body.place;
  const [folders, setFolders] = useState<Array<{ name: string; count: number }>>(preview?.folders ?? []);
  const [folder, setFolder] = useState(DEFAULT);
  const [menu, setMenu] = useState(preview?.menu === 'open' || preview?.menu === 'new');
  const [naming, setNaming] = useState(preview?.menu === 'new');
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>(() => {
    if (preview?.phase === 'saved' || preview?.phase === 'told') return { k: 'saved', planId: 'preview', created: true, savedAt: '', until: new Date(Date.now() + (preview.phase === 'saved' ? 8000 : -1)).toISOString(), folder: DEFAULT };
    if (preview?.phase === 'undone') return { k: 'undone' };
    if (preview?.phase === 'failed') return { k: 'failed', reason: 'Your draft is still here. Try again.' };
    return { k: 'draft' };
  });
  useLayoutEffect(() => {
    if (card.current?.animate) void taskIn(card.current, reduced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it arrives
  }, []);
  useEffect(() => {
    if (saveOn && !preview) void listPlanFolders().then((r) => setFolders(r.folders));
  }, [saveOn, preview]);
  const undoOpen = useUndoWindow(phase.k === 'saved' ? phase.until : null);
  const clean = name.trim();
  const dupe = folders.some((f) => f.name.toLowerCase() === clean.toLowerCase()) || clean.toLowerCase() === DEFAULT.toLowerCase();
  const reserved = clean.toLowerCase() === 'team';
  const needsEvent = plan.eventId == null;
  const folderRef = useRef<HTMLButtonElement>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const save = async () => {
    setPhase({ k: 'busy' });
    if (preview) return setPhase({ k: 'saved', planId: 'preview', created: true, savedAt: '', until: new Date(Date.now() + 8000).toISOString(), folder });
    const res = await safeSave(() => savePracticePlanDraft({ eventId: plan.eventId, planId: null, version: 0, title: plan.title, draft: plan.draft, folder }));
    if (!res.success) return setPhase({ k: 'failed', reason: res.error });
    // The folder takes the page (M-ASK-78), then the receipt. It's saved already, so a stalled animation can't hold that back.
    if (folderRef.current) await Promise.race([squashFolder(folderRef.current, reduced).catch(() => {}), new Promise((done) => window.setTimeout(done, 800))]);
    setPhase({ k: 'saved', planId: res.planId, created: res.created, savedAt: res.savedAt, until: new Date(Date.now() + 8000).toISOString(), folder });
  };
  const undo = async () => {
    if (phase.k !== 'saved') return;
    if (preview) return setPhase({ k: 'undone' });
    if (undoing) return;
    setUndoing(true);
    const res = await safeSave(() => undoPracticePlanDraft({ planId: phase.planId, created: phase.created, savedAt: phase.savedAt }));
    setUndoing(false);
    if (res.success) setPhase({ k: 'undone' });
    else setUndoFailed(true);
  };
  const create = () => {
    if (!clean || dupe || reserved) return;
    setFolders((list) => [...list, { name: clean, count: 0 }]);
    setFolder(clean);
    setName('');
    setNaming(false);
    setMenu(false);
  };
  const open = phase.k === 'draft' || phase.k === 'busy' || phase.k === 'failed';
  const chip = phase.k === 'saved' ? 'Saved' : phase.k === 'undone' ? 'Undone' : phase.k === 'cancelled' ? 'Cancelled' : phase.k === 'failed' ? 'Not saved' : 'Draft';
  const list = [{ name: DEFAULT, count: folders.find((f) => f.name === DEFAULT)?.count ?? 0 }, ...folders.filter((f) => f.name !== DEFAULT)];
  return (
    <article ref={card} className={'task' + (phase.k === 'cancelled' ? ' cancelled' : '')} data-kind="plan" data-ch="plan-task">
      <div className="task__h">
        <span className="task__ic">
          <Ico d={CLIPBOARD} />
        </span>
        <span className="task__ttl">
          <b>{plan.title}</b>
          <span>Practice plan</span>
        </span>
        <Badge tone={phase.k === 'saved' ? 'positive' : phase.k === 'failed' ? 'warning' : 'neutral'}>{chip}</Badge>
      </div>
      <div className="task__b">
        <div className="pbar" aria-hidden="true">
          {blocks.map((b, i) => (
            <span key={b.id} className={`pseg ${SEG[i % 3]}`} style={{ flex: b.len }}>
              {b.title}
            </span>
          ))}
        </div>
        <ol className="pblocks">
          {blocks.map((b, i) => (
            <li key={b.id}>
              <i style={{ background: SWATCH[i % 3] }} aria-hidden="true" />
              <div>
                <b>{b.title}</b>
                {b.note && <span>{b.note}</span>}
              </div>
              <em className="ch-num">{b.len} min</em>
            </li>
          ))}
        </ol>
        <dl className="facts">
          <div className="fact">
            <dt>Length</dt>
            <dd className="ch-num">{total} min</dd>
          </div>
          {place && (
            <div className="fact">
              <dt>Where</dt>
              <dd>{place}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="task__f">
        {open && saveOn && (
          <>
            <div className="fold">
              <span className="fold__l">Save to</span>
              <button ref={folderRef} className="fold__b" type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <Ico d={FOLDER} className="fi" />
                <b>{folder}</b>
                <Ico d="M6 9l6 6 6-6" />
              </button>
            </div>
            {menu && (
              <ul className="fmenu" role="menu" aria-label="Folders">
                {list.map((f) => (
                  <li key={f.name} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={folder === f.name}
                      onClick={() => {
                        setFolder(f.name);
                        setMenu(false);
                      }}
                    >
                      <Ico d={FOLDER} className="fi" />
                      <span>
                        {f.name}
                        <small className="ch-num">{f.count}</small>
                      </span>
                      <Ico d="M5 13l4 4L19 7" className="ck" />
                    </button>
                  </li>
                ))}
                <li className="sepr" role="none">
                  {naming ? (
                    <form
                      className="fnew"
                      onSubmit={(e) => {
                        e.preventDefault();
                        create();
                      }}
                    >
                      <input aria-label="Folder name" ref={(el) => el?.focus()} maxLength={NAME_MAX} placeholder="Folder name" value={name} onChange={(e) => setName(e.target.value)} />
                      <Button variant="primary" size="lg" className="qc-act" type="submit" disabled={!clean || dupe || reserved}>
                        Create
                      </Button>
                      {clean && (dupe || reserved) && <p className="say quiet">{reserved ? '“Team” is the team’s own folder.' : 'You already have that folder.'}</p>}
                    </form>
                  ) : (
                    <button type="button" role="menuitem" className="newf" onClick={() => setNaming(true)}>
                      <Ico d="M12 5v14M5 12h14" />
                      <span>New folder</span>
                    </button>
                  )}
                </li>
              </ul>
            )}
          </>
        )}
        {open && (
          <>
            {saveOn && (
              <div className="oncf">
                <span>
                  <b>On confirm:</b> saved to Documents in {folder}. Players see it only when you publish.
                </span>
              </div>
            )}
            {undoFailed && (
              <p className="say quiet" role="alert">
                Too late to undo. It’s saved.
              </p>
            )}
            {phase.k === 'failed' && (
              <p className="say quiet" role="alert">
                {phase.reason}
              </p>
            )}
            {saveOn && needsEvent && <p className="say quiet">Confirm the practice first. Save turns on once it’s on the calendar.</p>}
            {!online && <p className="say quiet">You’re offline. Nothing was saved.</p>}
            <div className="btns">
              {phase.k !== 'busy' && (
                <Button variant="ghost" size="lg" onClick={() => setPhase({ k: 'cancelled' })}>
                  Cancel
                </Button>
              )}
              <Button variant="primary" size="lg" className="qc-act" busy={phase.k === 'busy'} disabled={!saveOn || !online || needsEvent || phase.k === 'busy'} onClick={() => void save()}>
                <span className="lbl">{phase.k === 'busy' ? 'Saving…' : phase.k === 'failed' ? 'Try again' : 'Save plan'}</span>
              </Button>
            </div>
          </>
        )}
        {phase.k === 'saved' && (
          <>
            <div className="rcpt">
              <span className="rcpt__g pop">
                <Ico d="M5 13l4 4L19 7" />
              </span>
              <span className="rcpt__t">
                <b>Plan saved</b>
                <span>Documents · {phase.folder}</span>
              </span>
              <span className="rcpt__a">
                {undoOpen && (
                  <button className="tbtn" type="button" data-a="undo" onClick={() => void undo()}>
                    Undo
                  </button>
                )}
                <button className="tbtn" type="button" data-a="open" onClick={() => onOpen(`/golf/dashboard/practice/plan/${phase.planId}?from=coachhelm`)}>
                  Open
                </button>
              </span>
            </div>
            {!undoOpen && (
              <div className="told">
                <span>Only coaches can see it. Players are told when you publish.</span>
              </div>
            )}
          </>
        )}
        {phase.k === 'undone' && (
          <div className="rcpt neutral">
            <span className="rcpt__g">
              <Ico d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
            </span>
            <span className="rcpt__t">
              <b>Undone</b>
              <span>Nothing was saved.</span>
            </span>
          </div>
        )}
        {phase.k === 'cancelled' && (
          <div className="rcpt neutral">
            <span className="rcpt__g">
              <Ico d="M6 6l12 12M18 6L6 18" />
            </span>
            <span className="rcpt__t">
              <b>Cancelled</b>
              <span>Nothing was created.</span>
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
