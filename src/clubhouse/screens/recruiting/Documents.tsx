'use client';

import { FileText, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  CH_DOC_CATEGORIES,
  DOC_ACCEPT,
  FILM_EXTENSIONS,
  categoryLabel,
  newRequestId,
  refusedProblem,
  screenDrop,
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
import { friendlyReason, normalise, useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { PillGroup } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { EmptyRow } from './parts';
import type { RecInitialUpload } from './ctx';
import type { ChRecruitingWrites } from './writes';

type DocState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; docs: ChDocument[] };

/**
 * A file chosen and waiting for its title and category, or refused before anything is sent. `file` is null only when a drop held
 * no file to name (an empty drop, a folder). `uploadId` names the stored object and is kept across a Retry (CH-14916).
 */
interface Staged {
  file: File | null;
  title: string;
  category: ChDocCategory;
  problem: ChFileProblem | null;
  uploadId: string;
}

const extensionOf = (name: string) => (name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '');
const stagedFrom = (file: File): Staged => ({
  file,
  title: stripExtension(file.name),
  // Film is what a video is for; the coach can still pick another category.
  category: FILM_EXTENSIONS.includes(extensionOf(file.name)) ? 'film' : 'note',
  problem: screenFile(file),
  uploadId: newRequestId(),
});

/** The preview's and the tests' way to open the dialog on a file without choosing one: a file of that name and size, refused as Storage would have. */
function stagedForPreview(u: RecInitialUpload): Staged {
  const file = new File([], u.name, { type: '' });
  Object.defineProperty(file, 'size', { value: u.size });
  const staged = stagedFrom(file);
  return u.refused ? { ...staged, problem: refusedProblem(u.refused, file) } : staged;
}

/**
 * One prospect's documents (CH-14xxx): the list with its own loading, failure and empty states, Upload (a file drop on
 * desktop too, CH-14917), opening a file, and removing one. Files are private to the team's coaches and open through a link that expires, never a
 * public address. The section reads its own list when the prospect opens, so a failed read says so here and the rest
 * of the panel still works. Every write goes through `useAction`, and what follows a write (the list, the open dialog)
 * happens inside the action, so a toast's Retry finishes the job as well.
 */
export function Documents({ prospect, writes, initialUpload }: { prospect: ChProspect; writes: ChRecruitingWrites; initialUpload?: RecInitialUpload }) {
  const toast = useToast();
  const phone = useChPhone();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DocState>({ kind: 'loading' });
  const [staged, setStaged] = useState<Staged | null>(() => (initialUpload ? stagedForPreview(initialUpload) : null));
  const [asking, setAsking] = useState<ChDocument | null>(null);
  /** How much of the file has left this device, while it is being sent (CH-14407). Null when nothing is known. */
  const [progress, setProgress] = useState<number | null>(null);
  /** The file is being dragged over the section (CH-14917). */
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);
  /** Set when Storage turned the file itself down: the dialog says so, so the toast stays quiet. */
  const refusedRef = useRef(false);
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

  const uploadAction = async (file: File, meta: { title: string; category: ChDocCategory }, uploadId: string) => {
    refusedRef.current = false;
    setProgress(null);
    let res: Awaited<ReturnType<typeof writes.documents.upload>>;
    try {
      res = await writes.documents.upload(id, file, meta, { uploadId, onProgress: setProgress });
    } finally {
      setProgress(null);
    }
    if (normalise(res).success) {
      setStaged(null);
      toast({ title: `${meta.title} added`, code: 'CH-14908' });
      await refresh();
    } else if (res.refused) {
      // CH-14107, CH-14108: the file itself was turned down, which no Retry can change. The dialog says so, beside the file.
      // CH-14703: the error pattern, once, with no toast.
      refusedRef.current = true;
      haptic('error');
      setStaged((s) => (s && s.file === file ? { ...s, problem: refusedProblem(res.refused!, file) } : s));
    }
    return res;
  };
  const upload = useAction(
    'recruiting.upload',
    uploadAction,
    (file: File, meta: { title: string; category: ChDocCategory }) => ({
      done: '',
      failed: `Couldn't upload ${meta.title || file.name}`,
      hint: 'Nothing was added. Check your connection and try again.',
      code: 'CH-14005',
    }),
    // A refusal of the file is drawn by the dialog. Anything else keeps the toast's own wording: the server's sentence if it gave one.
    (result, copy) => (refusedRef.current ? { ...copy, quiet: true } : { ...copy, hint: (!result.success && friendlyReason(result.error)) || copy.hint }),
  );

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
    setStaged(stagedFrom(file));
  };

  // ── Drop a file (desktop, CH-14917) ────────────────────────────────────────
  // The Upload button stays: it is the keyboard path, and the phone's only one. A drop takes one file and goes through the same
  // dialog (title, category, the same refusals); several files or a folder are refused with a sentence (CH-14109, CH-14110).
  const droppable = !phone && !staged && state.kind !== 'failed';
  const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const dropped = (dt: DataTransfer) => {
    const files = Array.from(dt.files ?? []);
    const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file');
    // The entry must be read while the drop event is still being handled; a folder arrives as a file with no type and no size to go by.
    const folder = items.some((i) => i.webkitGetAsEntry?.()?.isDirectory === true);
    chTrail('recruiting drop');
    const problem = screenDrop({ count: Math.max(files.length, items.length), folder, file: files[0] ?? null });
    if (problem) setStaged({ file: files[0] ?? null, title: '', category: 'note', problem, uploadId: '' });
    else setStaged(stagedFrom(files[0]!));
  };
  const dropProps = droppable
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setOver(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setOver(false);
        },
        onDrop: (e: DragEvent) => {
          if (!carriesFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setOver(false);
          dropped(e.dataTransfer);
        },
      }
    : {};

  // While the dialog is open (and so while a file is being sent) a file dropped anywhere on the page would be opened by the browser in
  // place of the page, abandoning the upload. Refuse it: the drop does nothing (CH-14917).
  const dialogOpen = staged !== null;
  useEffect(() => {
    if (!dialogOpen || phone) return;
    const refuse = (e: globalThis.DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, [dialogOpen, phone]);

  const docs = state.kind === 'ready' ? state.docs : [];
  return (
    <section className={`ch-rec-sec${over ? ' is-drop' : ''}`} aria-label="Documents" data-ch-code={over ? 'CH-14917' : undefined} {...dropProps}>
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
      {!phone && state.kind === 'ready' && <span className="ch-rec-note ch-rec-drophint">Drop a file here to add it. Film can be an MP4, MOV or M4V.</span>}
      {over && (
        <div className="ch-rec-drop" aria-hidden="true">
          <Icon icon={Upload} size={18} />
          <span>Drop a file to add it</span>
        </div>
      )}

      <UploadDialog
        staged={staged}
        busy={upload.pending}
        progress={progress}
        onChange={setStaged}
        onClose={() => setStaged(null)}
        onChoose={choose}
        onUpload={(s) => s.file && void upload.run(s.file, { title: s.title.trim() || s.file.name, category: s.category }, s.uploadId)}
      />

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
  progress,
  onChange,
  onClose,
  onChoose,
  onUpload,
}: {
  staged: Staged | null;
  busy: boolean;
  /** Percent of the file sent, or null when it is not being sent or the browser cannot say. */
  progress: number | null;
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
      description={refused ? refused.body : staged?.file ? `${staged.file.name}${sizeLabel(staged.file.size) ? ` · ${sizeLabel(staged.file.size)}` : ''}` : undefined}
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
              {busy ? <span data-ch-code="CH-14404">{progress === null ? 'Uploading' : `Uploading ${progress}%`}</span> : 'Upload'}
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
          {busy && progress !== null && (
            <div className="ch-rec-up__progress" data-ch-code="CH-14407">
              <div className="ch-rec-up__bar" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="ch-rec-note">Keep this page open until it finishes.</span>
            </div>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
