'use client';
import { Button } from '../../../../ui/Button';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PhoneTop } from '../../../../shell/phone-chrome';
import { Icon } from '../../../../ui/Icon';
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

function Actions({ builderHref }: { builderHref: string | null }) {
  return (
    <div className="apf">
      {builderHref && (
        <Button variant="secondary" href={builderHref}>
          Edit in builder
        </Button>
      )}
      <Button variant="secondary" disabled>
        Save draft…
      </Button>
      <Button variant="primary" disabled>
        Publish…
      </Button>
    </div>
  );
}

/** Desktop: the right pane, the chat usable beside it. Phone: a pushed screen under the green bar. Same body, same versions. */
export function ArtifactView({ artifact, phone, body, onClose, builderHref = null }: { artifact: AskArtifact; phone: boolean; body: (versionBody: unknown) => ReactNode; onClose: () => void; builderHref?: string | null }) {
  const [at, setAt] = useState(artifact.versions.length - 1);
  const v = artifact.versions[Math.min(at, artifact.versions.length - 1)];
  if (phone) {
    return (
      <div className="ch-ak-push" role="dialog" aria-label={artifact.title}>
        <PhoneTop back={{ label: 'Ask', onBack: onClose }} title={artifact.title} />
        <div className="apb">{v && body(v.body)}</div>
        <div className="apdock">
          <Versions n={artifact.versions.length} at={at} onGo={setAt} />
          <Actions builderHref={builderHref} />
        </div>
      </div>
    );
  }
  return (
    <aside className="ch-ak-pane" aria-label={artifact.title}>
      <header>
        <span>
          <b>{artifact.title}</b>
          <small>{KIND_LABEL[artifact.kind]}</small>
        </span>
        <Versions n={artifact.versions.length} at={at} onGo={setAt} />
        <button type="button" className="sb" aria-label="Close" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </header>
      <div className="apb">{v && body(v.body)}</div>
      <Actions builderHref={builderHref} />
    </aside>
  );
}
