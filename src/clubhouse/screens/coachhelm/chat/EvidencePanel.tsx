'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { buildEvidencePanel, readForFocus, sourceLine, readBasis, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { Modal } from '../../../ui/Modal';
import { AskEvidenceView, DataTable } from './Evidence';
import { Studio } from './studio';
import '../../../styles/coachhelm-thread.css';
import { IconButton } from '../../../ui/Button';

/** The figures behind an action card, beside the conversation on desktop and in a sheet on a phone. */
export function AskEvidencePanel({ focus, messages, phone, onClose, open = true }: { focus: EvidenceFocus; messages: UIMessage[]; phone: boolean; onClose: () => void; open?: boolean }) {
  const model = useMemo(() => buildEvidencePanel(messages, focus), [messages, focus]);
  // A chip's read (chat v3): that one read, as the server returned it, with its window and sample under the name.
  const read = useMemo(() => readForFocus(messages, focus), [messages, focus]);
  const basis = read ? readBasis(read.envelope) : undefined;
  const readBody = read && (
    <div key={focus.ref} className={'ch-th-evp__body is-read' + (phone ? ' is-phone' : '')}>
      {read.envelope.coverage === 'unavailable' ? (
        <p className="ch-th-read">
          <b>This read didn’t come back.</b> The answer says what it is missing.
        </p>
      ) : (
        <AskEvidenceView envelope={read.envelope} roster={[]} ask={false} />
      )}
    </div>
  );
  const subtitle = read ? (basis ? sourceLine(basis) : 'What CoachHelm read') : model.subtitle;
  const title = read ? focus.label : 'Evidence';
  const body = readBody || (
    // `is-phone`: the sheet's figures are rows on the sheet, not tiles (coachhelm-thread.css, the cardless pass).
    <div className={'ch-th-evp__body ch-aks-ev' + (phone ? ' is-phone' : '')}>
      {model.empty ? (
        <p className="ch-th-read" data-ch-code="CH-13255">
          <b>Nothing in this conversation speaks to this player yet.</b> Ask about their putting or their recent rounds and the figures show here.
        </p>
      ) : (
        <>
          {/* The same studio the answer draws with, so a figure reads the same here as in the leaf; nothing asks from under a sheet. */}
          {model.tiles.length > 0 && (
            <div className="ch-aks-sec">
              <Studio part={{ kind: 'figure', data: { title: null, figures: model.tiles.map((t) => ({ key: t.label, label: t.label, value: t.value, sub: t.sub, tone: t.tone })) } }} size={phone ? 'compact' : 'full'} />
            </div>
          )}
          {model.trend && (
            <figure className="ch-aks-sec">
              <Studio part={{ kind: 'trend', data: { form: 'rounds', trend: model.trend } }} size={phone ? 'compact' : 'full'} />
              {model.trend.source && <p className="ch-aks-src ch-num">{model.trend.source}</p>}
            </figure>
          )}
          {model.table && (
            <div className="ch-aks-sec">
              <DataTable table={model.table} />
            </div>
          )}
          {model.smallSample && <p className="ch-th-evp__small">{model.smallSample}</p>}
        </>
      )}
    </div>
  );

  if (phone) {
    return (
      <Modal open={open} onClose={onClose} title={title} description={subtitle} code="CH-13851">
        {body}
      </Modal>
    );
  }
  return <DesktopPanel title={title} subtitle={subtitle} onClose={onClose}>{body}</DesktopPanel>;
}

function DesktopPanel({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Focus goes to the panel when it opens and back to the control that opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    // The keydown is the Esc path; the landmark itself is not interactive.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      ref={ref}
      className="ch-th-evp"
      aria-label="Evidence"
      tabIndex={-1}
      data-ch-code="CH-13851"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="ch-th-evp__head">
        <span className="ch-th-evp__titles">
          <b>{title}</b>
          <span>{subtitle}</span>
        </span>
        <IconButton icon={X} label="Close evidence" onClick={onClose} />
      </div>
      {children}
    </aside>
  );
}
