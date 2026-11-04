'use client';

import { FileText, Image as ImageIcon, ListChecks, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';
import type { ChConv } from './model';
import type { ChMessagesApi } from './MessagesView';
import { PollSheet } from './polls';

/**
 * The composer's + (S-MSG.attach): it turns to × and lifts a glass menu of exactly Photos, File and Poll (Nick, 31 Oct: no Camera, no
 * Announcement). Reopening while it closes reverses the same menu, never a second one (`is-closing`, 07 M-MSG-18c).
 */
export function ComposerPlusV2({ api, conv, disabled, onPick }: { api: ChMessagesApi; conv: ChConv; disabled?: boolean; onPick: (picked: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [polling, setPolling] = useState(false);
  const photos = useRef<HTMLInputElement | null>(null);
  const files = useRef<HTMLInputElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const close = () => {
    if (!open || closing) return;
    setClosing(true);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setClosing(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClosing(true);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const toggle = () => {
    haptic('select');
    if (open && !closing) close();
    else {
      setClosing(false);
      setOpen(true);
    }
  };
  const take = (input: HTMLInputElement) => {
    const picked = Array.from(input.files ?? []);
    if (picked.length) onPick(picked);
    input.value = '';
  };
  const canPoll = conv.group && !!api.polls;
  return (
    <div ref={root} className="ch-msv-plus">
      <button type="button" className={'ch-msv-plus__key' + (open && !closing ? ' is-open' : '')} aria-label={open && !closing ? 'Close' : 'Add a photo, file or poll'} aria-expanded={open && !closing} aria-haspopup="menu" disabled={disabled} onClick={toggle}>
        <Icon icon={Plus} size={20} />
      </button>
      {open && (
        <div
          className={'ch-msv-attach' + (closing ? ' is-closing' : '')}
          role="menu"
          aria-label="Add to the message"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && closing) {
              setOpen(false);
              setClosing(false);
            }
          }}
        >
          <button type="button" role="menuitem" onClick={() => { photos.current?.click(); close(); }}>
            <span className="ch-msv-attach__ic is-photos"><Icon icon={ImageIcon} size={17} /></span>
            Photos
          </button>
          <button type="button" role="menuitem" onClick={() => { files.current?.click(); close(); }}>
            <span className="ch-msv-attach__ic"><Icon icon={FileText} size={17} /></span>
            File
          </button>
          {canPoll && (
            <button type="button" role="menuitem" onClick={() => { setPolling(true); close(); }}>
              <span className="ch-msv-attach__ic"><Icon icon={ListChecks} size={17} /></span>
              Poll
            </button>
          )}
        </div>
      )}
      <input ref={photos} type="file" accept="image/*" multiple hidden disabled={disabled} onChange={(e) => take(e.target)} />
      <input ref={files} type="file" multiple hidden disabled={disabled} onChange={(e) => take(e.target)} />
      {canPoll && <PollSheet key={conv.id} api={api} conv={conv} open={polling} onClose={() => setPolling(false)} />}
    </div>
  );
}
