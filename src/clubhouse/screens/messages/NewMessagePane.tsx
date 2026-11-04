'use client';

import { Megaphone, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { popIn, tokenBeat } from './details-v2';
import { personOf, type ChMessagesApi } from './MessagesView';

/**
 * Desktop New message, in the thread column (MSG-NEW-02): a glass bar, the To card, Suggested. A name makes a green token, then the
 * conversation opens (MSG-NEW-03). A group and an announcement keep today's dialog, reached from here.
 */
export function NewMessagePane({ api, onCancel, onDialog }: { api: ChMessagesApi; onCancel: () => void; onDialog: (mode: 'group' | 'announce') => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const coach = api.viewer.role === 'coach';
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const term = q.trim().toLowerCase();
  const direct = useMemo(() => new Set(api.convs.filter((c) => !c.group).map((c) => c.memberIds[0])), [api.convs]);
  // Today's order, coaches first and then players by name; a search looks through everyone (d64).
  const people = api.directory.filter((p) => (term ? p.name.toLowerCase().includes(term) : !direct.has(p.userId)));
  const pick = (id: string) => {
    if (picked) return;
    haptic('select');
    setPicked(id);
    setQ('');
    window.setTimeout(() => {
      chTrail('messages start direct');
      void api.startDirect(id).then((ok) => {
        if (ok) onCancel();
        else setPicked(null);
      });
    }, tokenBeat());
  };
  return (
    <section className="ch-msv-newpane" aria-labelledby="ch-msv-new-title">
      <header className="ch-msv-newpane__bar">
        <b id="ch-msv-new-title">New message</b>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </header>
      <div className="ch-msv-newpane__in">
        <div className="ch-msv-tocard">
          <span aria-hidden="true">To:</span>
          {picked && (
            <button type="button" className="ch-msp-tok" ref={(el) => popIn(el, 0.8, true)} aria-label={`Remove ${personOf(api, picked)?.name ?? 'person'}`} onClick={() => setPicked(null)}>
              {personOf(api, picked)?.name ?? 'Member'}
              <Icon icon={X} size={12} />
            </button>
          )}
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" autoComplete="off" disabled={!!picked} />
        </div>
        {coach && !term && (
          <div className="ch-msp-panel ch-msv-newpane__more">
            <button type="button" className="ch-msv-frow" onClick={() => onDialog('group')}>
              <span className="ch-msv-frow__ic">
                <Icon icon={Users} size={16} />
              </span>
              <span className="ch-msv-member__b">
                <b>New group</b>
              </span>
            </button>
            <button type="button" className="ch-msv-frow" onClick={() => onDialog('announce')}>
              <span className="ch-msv-frow__ic">
                <Icon icon={Megaphone} size={16} />
              </span>
              <span className="ch-msv-member__b">
                <b>Announcement</b>
              </span>
            </button>
          </div>
        )}
        {api.directoryError ? (
          <InlineNotice code="CH-7205" title="Your team list didn’t load" body="Try again." onRetry={api.retryDirectory} />
        ) : (
          <section className="ch-msp-panel ch-msv-suggest" aria-label="Suggested">
            <header className="ch-msv-members__h">
              <b>{term ? 'Results' : 'Suggested'}</b>
              {!term && <span>Players you haven’t messaged</span>}
            </header>
            {people.map((p) => (
              <button key={p.userId} type="button" className="ch-msv-suggest__r" onClick={() => pick(p.userId)}>
                <Avatar name={p.name} id={p.playerId ?? p.userId} size={32} />
                <span className="ch-msv-member__b">
                  <b>{p.name}</b>
                  <span>{p.subtitle}</span>
                </span>
              </button>
            ))}
            {!people.length && <p className="ch-msp-none">{term ? `No one matches “${q.trim()}”.` : 'No one to message yet.'}</p>}
          </section>
        )}
      </div>
    </section>
  );
}
