'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlanDraft } from '@/lib/coachhelm/v3/practice-plan/model';
import { listPlanFolders, savePracticePlanDraft, undoPracticePlanDraft } from '@/app/golf/actions/coachhelm-practice-plans';
import { useUndoWindow } from './useUndoWindow';

export interface PlanPartData {
  version: number;
  eventId: string | null;
  title: string;
  draft: PlanDraft;
  /** Both flags on, read on the server when the card was written. Off: Save and Publish are inert and make no network call. */
  saveOn?: boolean;
}

const DEFAULT = 'Practice plans';
const FIELD_MAX = 60;

/** The plan in Ask: strip, blocks with their Why, folder row, Save draft and Publish. Coach only: never imported by a player surface. */
export function PlanCard({ plan, onSend }: { plan: PlanPartData; onSend: (text: string) => void }) {
  const router = useRouter();
  const saveOn = !!plan.saveOn;
  const blocks = plan.draft.body.variants.main.blocks;
  const total = blocks.reduce((s, b) => s + b.len, 0);
  const [folders, setFolders] = useState<Array<{ name: string; count: number }>>([]);
  const [folder, setFolder] = useState(DEFAULT);
  const [menu, setMenu] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<{ k: 'draft' | 'saving' | 'failed' | 'undone' } | { k: 'saved'; planId: string; version: number; created: boolean; savedAt: string; until: string; folder: string }>({ k: 'draft' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (saveOn) void listPlanFolders().then((r) => setFolders(r.folders));
  }, [saveOn]);
  const undoOpen = useUndoWindow(state.k === 'saved' ? state.until : null);
  const dupe = naming && folders.some((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  const reserved = naming && name.trim().toLowerCase() === 'team';
  const save = async () => {
    setState({ k: 'saving' });
    const res = await savePracticePlanDraft({ eventId: plan.eventId, planId: null, version: 0, title: plan.title, draft: plan.draft, folder });
    if (!res.success) {
      setError(res.error);
      return setState({ k: 'failed' });
    }
    setError(null);
    setState({ k: 'saved', planId: res.planId, version: res.version, created: res.created, savedAt: res.savedAt, until: new Date(Date.now() + 8000).toISOString(), folder: res.folder });
  };
  return (
    <section className="ch-cp-card" data-ch="plan-card">
      <h4>{plan.title}</h4>
      <div className="ch-cp-strip" aria-hidden="true">
        {blocks.map((b) => (
          <i key={b.id} style={{ flex: b.len }} />
        ))}
      </div>
      <div>
        {blocks.map((b) => {
          const why = plan.draft.why[b.id];
          return (
            <div className="ch-cp-row" key={b.id}>
              <span className="t">
                {b.len}
                <span>min</span>
              </span>
              <div>
                <b>{b.title}</b>
                {b.note && <p>{b.note}</p>}
                {why && (
                  <div className="ch-cp-why">
                    {why.aim && <b>{why.aim}</b>}
                    {why.routine ? 'Routine. No claim.' : why.lean ? 'Lean read' : why.because}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ch-cp-foot">
        {state.k === 'saved' ? (
          <div className="ch-cp-receipt" role="status">
            <b>Plan saved · Documents · {state.folder}</b>
            <span>Only coaches can see it. Players are told when you publish.</span>
            <div className="btns">
              {undoOpen && (
                <button
                  type="button"
                  className="ch-btn ch-btn--secondary"
                  onClick={() => {
                    void undoPracticePlanDraft({ planId: state.planId, created: state.created, savedAt: state.savedAt }).then((r) => (r.success ? setState({ k: 'undone' }) : setError(r.error ?? null)));
                  }}
                >
                  Undo
                </button>
              )}
              <button type="button" className="ch-btn ch-btn--secondary" onClick={() => router.push(`/golf/dashboard/practice/plan/${state.planId}?from=coachhelm`)}>
                Open
              </button>
              <button type="button" className="ch-btn ch-btn--primary" onClick={() => onSend(`Publish the plan ${plan.title}`)}>
                Publish…
              </button>
            </div>
          </div>
        ) : state.k === 'undone' ? (
          <p className="ch-cp-inert">Removed. Nothing was saved.</p>
        ) : !saveOn ? (
          <>
            <p className="ch-cp-inert">Comes with the Practice tab</p>
            <div className="btns">
              <button type="button" className="ch-btn ch-btn--secondary" disabled>
                Save draft…
              </button>
              <button type="button" className="ch-btn ch-btn--primary" disabled>
                Publish…
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="ch-cp-folder">
              Save to
              <button type="button" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                {folder}
              </button>
            </div>
            {menu && (
              <div className="ch-cp-menu" role="menu">
                {[{ name: DEFAULT, count: folders.find((f) => f.name === DEFAULT)?.count ?? 0 }, ...folders.filter((f) => f.name !== DEFAULT)].map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    role="menuitemradio"
                    aria-checked={folder === f.name}
                    onClick={() => {
                      setFolder(f.name);
                      setMenu(false);
                    }}
                  >
                    {f.name}
                    <span>{f.count}</span>
                  </button>
                ))}
                {naming ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (dupe || reserved || !name.trim()) return;
                      setFolders((list) => [{ name: name.trim(), count: 0 }, ...list]);
                      setFolder(name.trim());
                      setNaming(false);
                      setMenu(false);
                    }}
                  >
                    {/* eslint-disable-next-line jsx-a11y/no-autofocus -- a field the coach just asked for */}
                    <input aria-label="Folder name" autoFocus maxLength={FIELD_MAX} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNaming(false)} />
                    {dupe && <p className="ch-cp-inert">You already have that folder.</p>}
                    {reserved && <p className="ch-cp-inert">Team is taken. Pick another name.</p>}
                  </form>
                ) : (
                  <button type="button" onClick={() => setNaming(true)}>
                    New folder
                  </button>
                )}
              </div>
            )}
            {!plan.eventId && <p className="ch-cp-inert">A plan needs a practice on the calendar. Add one first.</p>}
            {error && (
              <p className="ch-cp-inert" role="alert">
                {error} Nothing was saved.
              </p>
            )}
            <div className="btns">
              <button type="button" className="ch-btn ch-btn--primary" disabled={state.k === 'saving' || !plan.eventId} onClick={() => void save()}>
                {state.k === 'saving' ? 'Saving…' : state.k === 'failed' ? 'Try again' : 'Save draft…'}
              </button>
            </div>
          </>
        )}
        <p className="ch-cp-inert">
          {total} min · {blocks.length} blocks
        </p>
      </div>
    </section>
  );
}
