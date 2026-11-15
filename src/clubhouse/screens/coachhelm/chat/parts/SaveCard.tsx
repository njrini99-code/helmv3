'use client';

import { ArrowUpRight, Check, ChevronDown, FileText, FolderClosed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askArtifactFolders, saveAskArtifact, undoAskArtifact } from '@/app/golf/actions/coachhelm-ask-artifacts';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { useUndoWindow } from '../../plan/useUndoWindow';
import { flyPageToFolder, squashFolder } from '../ask-flight';

const FIELD_MAX = 60;
/** The row for "no folder": the document sits in Documents itself. */
const ROOT = '';

type Folder = { name: string; count: number };
type Phase =
  | { k: 'draft' }
  | { k: 'saving' }
  | { k: 'failed'; error: string }
  | { k: 'saved'; id: string | null; savedAt: string; folder: string; until: string; note: string | null }
  | { k: 'undone' };

/**
 * Save draft (S-ASK.save): docked above the artifact's footer. "Save to" names the folder and opens the folder list in place, with New folder as a name field; the
 * primary names the target. It saves at once (a private document only coaches can see), the page drops into the folder, the count ticks, and the receipt keeps
 * Undo for 8 seconds. A folder is text on the document, so New folder is made by saving into it and Undo takes an emptied one away with the document.
 */
export function SaveCard({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const reduced = useChReducedMotion();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [folder, setFolder] = useState(ROOT);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>({ k: 'draft' });
  const [undoing, setUndoing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const page = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let live = true;
    void askArtifactFolders()
      .then((r) => {
        if (!live) return;
        setFolders(r.folders);
        // The most used folder is the likely one; the coach can pick another before anything is saved.
        if (r.folders[0]) setFolder((f) => (f === ROOT ? r.folders[0]!.name : f));
      })
      .catch(() => {
        if (live) setFolders([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const list = folders ?? [];
  const clean = name.trim().slice(0, FIELD_MAX);
  const dupe = naming && list.some((f) => f.name.toLowerCase() === clean.toLowerCase());
  const label = folder || 'Documents';
  const countOf = (n: string) => list.find((f) => f.name === n)?.count ?? 0;
  const undoOpen = useUndoWindow(phase.k === 'saved' ? phase.until : null);

  const save = async () => {
    setPhase({ k: 'saving' });
    setProblem(null);
    setOpen(false);
    const r = await saveAskArtifact({ title, body, folder: folder || null }).catch(() => ({ success: false, error: 'That didn’t save. Try again.' }) as { success: boolean; error?: string; id?: string; folder?: string | null; savedAt?: string });
    if (!r.success) {
      setPhase({ k: 'failed', error: r.error ?? 'That didn’t save. Try again.' });
      return;
    }
    // Saved with a note means the folder step failed and the draft is in Documents itself: say where it is.
    const landed = r.folder ?? (r.error ? ROOT : folder);
    if (landed && page.current && icon.current) {
      await flyPageToFolder(page.current, icon.current, reduced).catch(() => undefined);
      setFolders((l) => {
        const cur = l ?? [];
        return cur.some((f) => f.name === landed) ? cur.map((f) => (f.name === landed ? { ...f, count: f.count + 1 } : f)) : [{ name: landed, count: 1 }, ...cur];
      });
      await squashFolder(icon.current, reduced).catch(() => undefined);
    }
    setPhase({ k: 'saved', id: r.id ?? null, savedAt: r.savedAt ?? new Date().toISOString(), folder: landed || ROOT, until: new Date(Date.now() + 8000).toISOString(), note: r.error ?? null });
  };

  const undo = () => {
    if (phase.k !== 'saved' || !phase.id) return;
    setUndoing(true);
    void undoAskArtifact({ id: phase.id, savedAt: phase.savedAt })
      .then((r) => {
        if (!r.success) return setProblem(r.error ?? 'That wasn’t undone.');
        const was = phase.folder;
        setFolders((l) => (l ?? []).map((f) => (f.name === was ? { ...f, count: f.count - 1 } : f)).filter((f) => f.count > 0));
        setPhase({ k: 'undone' });
      })
      .catch(() => setProblem('That wasn’t undone.'))
      .finally(() => setUndoing(false));
  };

  const busy = phase.k === 'saving';
  const done = phase.k === 'saved' || phase.k === 'undone';
  return (
    <section className="ch-ak-sv" aria-label="Save draft">
      <div className="hd">
        <span ref={page} className="pg" aria-hidden="true">
          <Icon icon={FileText} size={18} />
        </span>
        <span className="tt">
          <b>{title}</b>
          <small>{phase.k === 'saved' ? 'Saved' : phase.k === 'undone' ? 'Not saved' : 'Draft'}</small>
        </span>
      </div>
      {!done && (
        <>
          <button type="button" className="row" aria-expanded={open} disabled={busy || folders === null} onClick={() => setOpen((v) => !v)}>
            <span ref={icon} className="fi" aria-hidden="true">
              <Icon icon={FolderClosed} size={18} />
            </span>
            <span className="n">
              Save to <b>{label}</b>
            </span>
            <span className="c ch-num">{countOf(folder)}</span>
            <Icon icon={ChevronDown} size={14} className="chev" />
          </button>
          {open && (
            <div className="list" role="menu" aria-label="Folders">
              {[{ name: ROOT, count: countOf(ROOT) }, ...list].map((f) => (
                <button
                  key={f.name || 'documents'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={folder === f.name}
                  className={'fr' + (folder === f.name ? ' on' : '')}
                  onClick={() => {
                    setFolder(f.name);
                    setOpen(false);
                  }}
                >
                  <Icon icon={FolderClosed} size={18} />
                  <span className="n">{f.name || 'Documents'}</span>
                  {f.name !== ROOT && <span className="c ch-num">{f.count}</span>}
                  <span className="tk">
                    <Icon icon={Check} size={16} />
                  </span>
                </button>
              ))}
              {naming ? (
                <form
                  className="fr nw"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!clean || dupe) return;
                    setFolders((l) => [{ name: clean, count: 0 }, ...(l ?? [])]);
                    setFolder(clean);
                    setName('');
                    setNaming(false);
                    setOpen(false);
                  }}
                >
                  <Icon icon={FolderClosed} size={18} />
                  <input
                    ref={(el) => {
                      el?.focus({ preventScroll: true });
                    }}
                    className="inp"
                    autoCapitalize="words"
                    enterKeyHint="done"
                    aria-label="Folder name"
                    maxLength={FIELD_MAX}
                    value={name}
                    placeholder="Folder name"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setNaming(false);
                        setName('');
                      }
                    }}
                  />
                  <Button variant="secondary" size="sm" type="submit" disabled={!clean || dupe}>
                    Create
                  </Button>
                  {clean && dupe && <p className="bad">You already have that folder.</p>}
                </form>
              ) : (
                <button type="button" className="fr nw" onClick={() => setNaming(true)}>
                  <Icon icon={FolderClosed} size={18} />
                  <span className="n">New folder</span>
                </button>
              )}
            </div>
          )}
          {phase.k === 'failed' && (
            <p className="bad" role="alert">
              {phase.error}
            </p>
          )}
          <p className="note">
            On save: only you can see it, in <b>Documents{folder ? ` · ${folder}` : ''}</b>. Players are told when you publish.
          </p>
          <div className="btns">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {busy ? (
              <span className="cap" role="status">
                Saving…
              </span>
            ) : (
              <Button variant="primary" disabled={folders === null || (naming && !!clean)} onClick={() => void save()}>
                {folder ? `Save to ${folder}` : 'Save'}
              </Button>
            )}
          </div>
        </>
      )}
      {phase.k === 'saved' && (
        <div className="receipt in" role="status">
          <span className="ck">
            <Icon icon={Check} size={13} />
          </span>
          <div>
            <b>Draft saved · Documents{phase.folder ? ` · ${phase.folder}` : ''}</b>
            <span className="sub">{problem ?? phase.note ?? 'Only you can see it. Players are told when you publish.'}</span>
          </div>
          <a className="lk" href="/golf/dashboard/documents">
            Open
            <Icon icon={ArrowUpRight} size={14} />
          </a>
          {phase.id && undoOpen && (
            <button type="button" className="lk undo" data-ch-ask-undo="" disabled={undoing} aria-label="Undo, 8 seconds" onClick={undo}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden="true">
                <circle className="trk" cx="12" cy="12" r="10" />
                <circle className="drn" cx="12" cy="12" r="10" suppressHydrationWarning />
              </svg>
              {undoing ? 'Undoing' : 'Undo'}
            </button>
          )}
        </div>
      )}
      {phase.k === 'undone' && <p className="cxl">Removed. Nothing was saved.</p>}
      {done && (
        <div className="btns">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </section>
  );
}
