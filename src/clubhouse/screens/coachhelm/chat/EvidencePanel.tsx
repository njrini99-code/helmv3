'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { buildEvidencePanel, type EvidenceFocus } from '../../../data/coachhelm-chat-thread';
import { Icon } from '../../../ui/Icon';
import { Modal } from '../../../ui/Modal';
import { DataTable, Tiles, Trend } from './Evidence';
import '../../../styles/coachhelm-thread.css';

/** The figures behind an action card, beside the conversation on desktop and in a sheet on a phone. */
export function AskEvidencePanel({ focus, messages, phone, onClose }: { focus: EvidenceFocus; messages: UIMessage[]; phone: boolean; onClose: () => void }) {
  const model = useMemo(() => buildEvidencePanel(messages, focus), [messages, focus]);
  const body = (
    <div className="ch-th-evp__body">
      {model.empty ? (
        <p className="ch-th-read" data-ch-code="CH-13255">
          <b>Nothing in this conversation speaks to this player yet.</b> Ask about their putting or their recent rounds and the figures show here.
        </p>
      ) : (
        <>
          {model.tiles.length > 0 && <Tiles tiles={model.tiles} />}
          {model.trend && (
            <figure className="ch-th-fig ch-th-fig--bare">
              <figcaption>{model.trend.title}</figcaption>
              <Trend block={model.trend} />
              {model.trend.source && <p className="ch-th-fig__src">{model.trend.source}</p>}
            </figure>
          )}
          {model.table && <DataTable table={model.table} />}
          {model.smallSample && <p className="ch-th-evp__small">{model.smallSample}</p>}
        </>
      )}
    </div>
  );

  if (phone) {
    return (
      <Modal open onClose={onClose} title="Evidence" description={model.subtitle} code="CH-13851">
        {body}
      </Modal>
    );
  }
  return <DesktopPanel subtitle={model.subtitle} onClose={onClose}>{body}</DesktopPanel>;
}

function DesktopPanel({ subtitle, onClose, children }: { subtitle: string; onClose: () => void; children: ReactNode }) {
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
          <b>Evidence</b>
          <span>{subtitle}</span>
        </span>
        <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn" aria-label="Close evidence" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </div>
      {children}
    </aside>
  );
}
