'use client';
import { Button } from '../../../../ui/Button';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PhoneScreen } from '../../../../shell/PhoneScreen';
import { PhoneBar } from '../../../../ui/PhoneBar';
import { Icon } from '../../../../ui/Icon';
import { Modal } from '../../../../ui/Modal';
import { Select } from '../../../../ui/Select';
import { useToast } from '../../../../ui/Toast';
import { askArtifactFolders, saveAskArtifact } from '@/app/golf/actions/coachhelm-ask-artifacts';
import { AskProse } from '../Prose';
import { KIND_LABEL, type AskArtifact } from './artifacts';

/** A card in the stream: the tile scans while it writes. */
export function ArtifactCard({ artifact, writing, onOpen }: { artifact: AskArtifact; writing: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="acard" data-ch-press=".97" onClick={onOpen}>
      <span className={'tile' + (writing ? ' busy' : '')} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        <b>{artifact.title}</b>
        <span>{KIND_LABEL[artifact.kind]}</span>
      </span>
      <span className="go">Open</span>
    </button>
  );
}

const words = (key: string) => key.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The artifact's words, never its raw data (ASK-1): text as prose; a record as labelled rows, a list as a list, however deep. */
export function ArtifactBody({ body }: { body: unknown }) {
  if (body == null) return null;
  if (typeof body === 'string') return <AskProse text={body} playersByName={{}} />;
  if (typeof body !== 'object') return <p className="ch-th-p">{String(body)}</p>;
  if (Array.isArray(body))
    return (
      <ul className="ch-th-list">
        {body.map((item, i) => (
          <li key={i}>
            <ArtifactBody body={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="ch-ak-rec">
      {Object.entries(body as Record<string, unknown>)
        .filter(([key, v]) => v != null && v !== '' && !/(^|_)id$/.test(key))
        .map(([key, v]) => (
          <div key={key}>
            <dt>{words(key)}</dt>
            <dd>
              <ArtifactBody body={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}

function Versions({ n, at, onGo }: { n: number; at: number; onGo: (i: number) => void }) {
  if (n < 2) return null;
  return (
    <span className="vers ch-num">
      <button type="button" aria-label="Earlier version" disabled={at === 0} onClick={() => onGo(at - 1)}>
        <Icon icon={ChevronLeft} size={16} />
      </button>
      {at + 1} of {n}
      <button type="button" aria-label="Later version" disabled={at === n - 1} onClick={() => onGo(at + 1)}>
        <Icon icon={ChevronRight} size={16} />
      </button>
    </span>
  );
}

const NEW_FOLDER = '__new';
const NO_FOLDER = '__none';

/** E-SAVE: a private draft in a folder. A folder is text on the document, so New folder is a name, made by saving into it. */
function SaveDraft({ open, onClose, title, body }: { open: boolean; onClose: () => void; title: string; body: string }) {
  const toast = useToast();
  const [folders, setFolders] = useState<Array<{ name: string; count: number }> | null>(null);
  const [choice, setChoice] = useState(NO_FOLDER);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void askArtifactFolders()
      .then((r) => {
        if (!live) return;
        setFolders(r.folders);
        // The most used folder is the likely one; the coach can pick another before anything is saved.
        if (r.folders[0]) setChoice((c) => (c === NO_FOLDER ? r.folders[0]!.name : c));
      })
      .catch(() => {
        if (live) setFolders([]);
      });
    return () => {
      live = false;
    };
  }, [open]);
  const folder = choice === NEW_FOLDER ? name.trim() : choice === NO_FOLDER ? null : choice;
  const blocked = choice === NEW_FOLDER && !folder;
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await saveAskArtifact({ title, body, folder }).catch(() => ({ success: false, error: 'That didn’t save. Try again.' }));
    setBusy(false);
    if (!r.success) return setProblem(r.error ?? 'That didn’t save. Try again.');
    toast({ title: r.error ?? (folder ? `Saved to ${folder}` : 'Saved to Documents'), body: r.error ? undefined : 'Only coaches can see it.' });
    onClose();
  };
  return (
    <Modal
      open={open}
      title="Save draft"
      description="Only coaches can see a draft."
      detent={0.62}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} disabled={blocked} onClick={() => void save()}>
            {folder ? `Save to ${folder}` : 'Save'}
          </Button>
        </>
      }
    >
      <div className="ch-ak-save">
        <div className="ch-field">
          <span className="ch-field__label">Folder</span>
          <Select
            label="Folder"
            value={choice}
            disabled={folders === null}
            onChange={setChoice}
            options={[...(folders ?? []).map((f) => ({ value: f.name, label: `${f.name} (${f.count})` })), { value: NO_FOLDER, label: 'No folder' }, { value: NEW_FOLDER, label: 'New folder' }]}
          />
        </div>
        {choice === NEW_FOLDER && (
          <div className="ch-field">
            <label className="ch-field__label" htmlFor="ch-ak-save-name">
              Folder name
            </label>
            <input id="ch-ak-save-name" className="ch-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        {problem && (
          <p className="ch-field__help is-error" role="alert">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Actions({ artifact, body, builderHref, onPublish }: { artifact: AskArtifact; body: unknown; builderHref: string | null; onPublish?: (title: string) => void }) {
  const [saving, setSaving] = useState(false);
  // The plan's own Save row does the saving in the thread (one Save row, practice-plan 02). Everything else saves from here (E-APANEL).
  const words = artifact.kind !== 'practice_plan' && typeof body === 'string' && body.trim() ? body : null;
  if (!builderHref && !words) return null;
  return (
    <div className="apf">
      {builderHref && (
        <Button variant="secondary" href={builderHref}>
          Edit in builder
        </Button>
      )}
      {words && (
        <Button variant="secondary" onClick={() => setSaving(true)}>
          Save draft…
        </Button>
      )}
      {words && onPublish && (
        <Button variant="primary" onClick={() => onPublish(artifact.title)}>
          Publish…
        </Button>
      )}
      {words && <SaveDraft open={saving} onClose={() => setSaving(false)} title={artifact.title} body={words} />}
    </div>
  );
}

/** Desktop: the right pane, the chat usable beside it. Phone: a pushed screen under the green bar. Same body, same versions. */
export function ArtifactView({ artifact, phone, body, onClose, builderHref = null, onPublish }: { onPublish?: (title: string) => void; artifact: AskArtifact; phone: boolean; body: (versionBody: unknown) => ReactNode; onClose: () => void; builderHref?: string | null }) {
  const [at, setAt] = useState(artifact.versions.length - 1);
  const v = artifact.versions[Math.min(at, artifact.versions.length - 1)];
  // M-ASK-30: it slides back out, then leaves. With nothing to wait for (Animations off), it leaves at once.
  const root = useRef<HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const running = root.current?.getAnimations?.() ?? [];
    if (running.length === 0) return onClose();
    let live = true;
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (live) onClose();
    });
    return () => {
      live = false;
    };
  }, [leaving, onClose]);
  const close = () => setLeaving(true);
  // A pushed screen: edge swipe back, focus and modality come with it, and its bar is the only one (ASK-3, MOB-ASK-5, MOB-ASK-19, MOT-14).
  if (phone) {
    return (
      <PhoneScreen labelledBy={`ch-ak-push-${artifact.id}`} className="ch-ak-push">
        <PhoneBar back={{ label: 'Ask', onBack: onClose }} title={artifact.title} titleId={`ch-ak-push-${artifact.id}`} />
        <div className="apb">{v && body(v.body)}</div>
        <div className="apdock">
          <Versions n={artifact.versions.length} at={at} onGo={setAt} />
          <Actions artifact={artifact} body={v?.body} builderHref={builderHref} onPublish={onPublish} />
        </div>
      </PhoneScreen>
    );
  }
  return (
    <aside ref={root} className={'ch-ak-pane' + (leaving ? ' is-leaving' : '')} aria-label={artifact.title}>
      <header>
        <span>
          <b>{artifact.title}</b>
          <small>{KIND_LABEL[artifact.kind]}</small>
        </span>
        <Versions n={artifact.versions.length} at={at} onGo={setAt} />
        <button type="button" className="sb" aria-label="Close" onClick={close}>
          <Icon icon={X} size={16} />
        </button>
      </header>
      <div className="apb">{v && body(v.body)}</div>
      <Actions artifact={artifact} body={v?.body} builderHref={builderHref} onPublish={onPublish} />
    </aside>
  );
}
