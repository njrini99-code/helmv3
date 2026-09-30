'use client';

import { FileText, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  CH_DOC_CATEGORIES,
  DOC_ACCEPT,
  categoryLabel,
  screenFile,
  sizeLabel,
  stripExtension,
  type ChDocCategory,
  type ChDocument,
  type ChFileProblem,
  type ChProspect,
} from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { normalise, useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { PillGroup } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { EmptyRow } from './parts';
import type { ChRecruitingWrites } from './writes';

type DocState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; docs: ChDocument[] };

/** A file chosen and waiting for its title and category, or refused before anything is sent. */
interface Staged {
  file: File;
  title: string;
  category: ChDocCategory;
  problem: ChFileProblem | null;
}

/**
 * One prospect's documents (CH-14xxx): the list with its own loading, failure and empty states, Upload, opening a
 * file, and removing one. Files are private to the team's coaches and open through a link that expires, never a
 * public address. The section reads its own list when the prospect opens, so a failed read says so here and the rest
 * of the panel still works. Every write goes through `useAction`, and what follows a write (the list, the open dialog)
 * happens inside the action, so a toast's Retry finishes the job as well.
 */
export function Documents({ prospect, writes }: { prospect: ChProspect; writes: ChRecruitingWrites }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DocState>({ kind: 'loading' });
  const [staged, setStaged] = useState<Staged | null>(null);
  const [asking, setAsking] = useState<ChDocument | null>(null);
  const id = prospect.id;

  const fetchDocs = useCallback(async (): Promise<DocState> => {
    try {
      const r = normalise(await writes.documents.list(id));
      return r.success ? { kind: 'ready', docs: r.data ?? [] } : { kind: 'failed' };
    } catch {
      return { kind: 'failed' };
    }
  }, [id, writes]);

  // The list is read when a prospect opens. A prospect opened and closed quickly must not leave its answer on the next one.
  useEffect(() => {
    let off = false;
    setState({ kind: 'loading' });
    void fetchDocs().then((s) => {
      if (!off) setState(s);
    });
    return () => {
      off = true;
    };
  }, [fetchDocs]);

  const tryAgain = () => {
    setState({ kind: 'loading' });
    void fetchDocs().then(setState);
  };
  /** Read the list again after a write, keeping the rows on screen meanwhile so the section never flashes empty. */
  const refresh = async () => setState(await fetchDocs());

  const uploadAction = async (file: File, meta: { title: string; category: ChDocCategory }) => {
    const res = await writes.documents.upload(id, file, meta);
    if (normalise(res).success) {
      setStaged(null);
      toast({ title: `${meta.title} added`, code: 'CH-14908' });
      await refresh();
    }
    return res;
  };
  const upload = useAction('recruiting.upload', uploadAction, (file: File, meta: { title: string; category: ChDocCategory }) => ({
    done: '',
    failed: `Couldn't upload ${meta.title || file.name}`,
    hint: 'Nothing was added. Check your connection and try again.',
    code: 'CH-14005',
  }));

  const removeAction = async (doc: ChDocument) => {
    const res = await writes.documents.remove(doc.id);
    if (normalise(res).success) {
      setAsking(null);
      toast({ title: `${doc.title} removed`, code: 'CH-14908' });
      await refresh();
    }
    return res;
  };
  const remove = useAction('recruiting.removeDocument', removeAction, (doc: ChDocument) => ({
    done: '',
    failed: `Couldn't remove ${doc.title}`,
    hint: 'It is still on the prospect. Try again.',
    code: 'CH-14006',
  }));

  const openAction = (doc: ChDocument) => writes.documents.open(doc);
  const open = useAction('recruiting.openDocument', openAction, (doc: ChDocument) => ({
    done: '',
    failed: `Couldn't open ${doc.title}`,
    hint: 'The link could not be made. Check your connection and try again.',
    code: 'CH-14007',
  }));

  const choose = () => {
    chTrail('recruiting upload');
    fileInput.current?.click();
  };
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Choosing the same file twice in a row must still fire: the input forgets it.
    e.target.value = '';
    if (!file) return;
    setStaged({ file, title: stripExtension(file.name), category: 'note', problem: screenFile(file) });
  };

  const docs = state.kind === 'ready' ? state.docs : [];
  return (
    <section className="ch-rec-sec" aria-label="Documents">
      <div className="ch-rec-sec__head">
        <h3>Documents</h3>
        {state.kind !== 'failed' && !(state.kind === 'ready' && docs.length === 0) && (
          <button type="button" className="ch-rec-link" onClick={choose}>
            <Icon icon={Upload} size={15} />
            Upload
          </button>
        )}
      </div>
      <input ref={fileInput} type="file" accept={DOC_ACCEPT} hidden onChange={picked} />

      {state.kind === 'loading' ? (
        <div className="ch-rec-docs is-loading" aria-busy="true" data-ch-code="CH-14402">
          <span className="ch-sr-only">Loading documents</span>
          {[0, 1].map((i) => (
            <div key={i} className="ch-rec-doc">
              <Skeleton width={i ? '52%' : '64%'} height={14} />
              <Skeleton width={64} height={20} radius={6} />
            </div>
          ))}
        </div>
      ) : state.kind === 'failed' ? (
        <InlineNotice code="CH-14202" title="Documents didn't load" body="Nothing is lost. Try again in a moment." onRetry={tryAgain} />
      ) : docs.length === 0 ? (
        <EmptyRow code="CH-14305" icon={FileText} title="No documents yet" body="Schedules, transcripts and film, private to your staff." actionLabel="Upload" onAction={choose} />
      ) : (
        <>
          <ul className="ch-rec-docs">
            {docs.map((d) => (
              <li key={d.id} className="ch-rec-doc">
                <button type="button" className="ch-rec-doc__open" onClick={() => void open.run(d)}>
                  <span className="ch-rec-doc__t">{d.title}</span>
                  <span className="ch-rec-tag">{categoryLabel(d.category)}</span>
                </button>
                <button
                  type="button"
                  className="ch-rec-doc__x"
                  aria-label={`Remove ${d.title}`}
                  onClick={() => {
                    haptic('warning');
                    setAsking(d);
                  }}
                >
                  <Icon icon={Trash2} size={15} />
                </button>
              </li>
            ))}
          </ul>
          <span className="ch-rec-note">Private to your staff. Files open through a link that expires.</span>
        </>
      )}

      <UploadDialog staged={staged} busy={upload.pending} onChange={setStaged} onClose={() => setStaged(null)} onChoose={choose} onUpload={(s) => void upload.run(s.file, { title: s.title.trim() || s.file.name, category: s.category })} />

      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        width={460}
        icon={Trash2}
        code="CH-14502"
        title="Remove this document?"
        description={asking ? `${asking.title} is deleted from ${prospect.firstName}'s documents. This can't be undone.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={remove.pending}
              feel="warning"
              onClick={() => {
                if (asking) void remove.run(asking);
              }}
            >
              {remove.pending ? <span data-ch-code="CH-14405">Removing</span> : 'Remove document'}
            </Button>
          </>
        }
      />
    </section>
  );
}

/** Title and category for the chosen file, or why it can't be taken. Not on the boards: built from Clubhouse parts (DESIGN.md, open question). */
function UploadDialog({
  staged,
  busy,
  onChange,
  onClose,
  onChoose,
  onUpload,
}: {
  staged: Staged | null;
  busy: boolean;
  onChange: (s: Staged) => void;
  onClose: () => void;
  onChoose: () => void;
  onUpload: (s: Staged) => void;
}) {
  const titleId = useId();
  const refused = staged?.problem;
  return (
    <Modal
      open={!!staged}
      onClose={() => !busy && onClose()}
      width={480}
      icon={Upload}
      title={refused ? refused.title : 'Add a document'}
      description={refused ? refused.body : staged ? `${staged.file.name}${sizeLabel(staged.file.size) ? ` · ${sizeLabel(staged.file.size)}` : ''}` : undefined}
      code={refused?.code}
      footer={
        refused ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onChoose}>
              Choose another file
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || !staged} onClick={() => staged && onUpload(staged)}>
              {busy ? <span data-ch-code="CH-14404">Uploading</span> : 'Upload'}
            </Button>
          </>
        )
      }
    >
      {staged && !refused && (
        <form
          className="ch-rec-up"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onUpload(staged);
          }}
        >
          <div className="ch-field">
            <label htmlFor={`${titleId}-t`} className="ch-field__label">
              Title
            </label>
            <input id={`${titleId}-t`} className="ch-input" value={staged.title} maxLength={200} disabled={busy} onChange={(e) => onChange({ ...staged, title: e.target.value })} />
          </div>
          <div className="ch-field">
            <span className="ch-field__label">Category</span>
            <PillGroup<ChDocCategory>
              label="Category"
              value={staged.category}
              options={CH_DOC_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              onChange={(category) => onChange({ ...staged, category })}
            />
          </div>
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
