'use client';

import type { ChMessagesApi } from '../api/types';
import { type AnnDraft, NO_ANN } from './phone-types';
import { useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { PhoneBar, PhoneTextAction } from '../../../ui/PhoneBar';
import { Switch } from '../../../ui/Switch';

/* New announcement (a coach's, from New message: D-44) */

export function PhoneAnnouncementForm({ api, onCancel, draft, onDraft }: { api: ChMessagesApi; onCancel: () => void; draft: AnnDraft; onDraft: (d: AnnDraft) => void }) {
  // Held by MessagesPhone, so Cancel keeps it until the post lands (wave 5 #7).
  const { title, body, urgent, ack } = draft;
  const setTitle = (v: string) => onDraft({ ...draft, title: v });
  const setBody = (v: string) => onDraft({ ...draft, body: v });
  const setUrgent = (v: boolean) => onDraft({ ...draft, urgent: v });
  const setAck = (v: boolean) => onDraft({ ...draft, ack: v });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const needsTitle = !title.trim();
  const needsBody = !body.trim();
  const post = async () => {
    setTouched(true);
    if (needsTitle || needsBody) {
      haptic("warning");
      return;
    }
    setBusy(true);
    const ok = await api.createAnnouncement({ title: title.trim(), body: body.trim(), urgent, ack });
    setBusy(false);
    if (ok) onDraft(NO_ANN);
  };
  return (
    <PhoneScreen labelledBy="ch-msp-announce-title" className="ch-msp-announce" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New announcement"
        titleId="ch-msp-announce-title"
        action={
          <PhoneTextAction onClick={() => void post()} busy={busy}>
            {busy ? "Posting…" : "Post"}
          </PhoneTextAction>
        }
      />
      <div className="ch-msp-scroll">
        <div className="ch-msp-page">
          <p className="ch-msp-hint">Goes to everyone on {api.teamName ?? "the team"}. Players can acknowledge it.</p>
          <label className="ch-field">
            <span className="ch-field__label">Title</span>
            <input className="ch-input" placeholder="Bus time moved to 6:00" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={touched && needsTitle} />
            {touched && needsTitle && (
              <span className="ch-field__help is-error" data-ch-code="CH-7102">
                Give the announcement a title.
              </span>
            )}
          </label>
          <label className="ch-field">
            <span className="ch-field__label">Message</span>
            <textarea className="ch-textarea" rows={5} placeholder="What the team needs to know, and by when" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} aria-invalid={touched && needsBody} />
            {touched && needsBody && (
              <span className="ch-field__help is-error" data-ch-code="CH-7103">
                Write what the team needs to know.
              </span>
            )}
          </label>
          <div className="ch-msp-panel">
            <div className="ch-msp-set">
              <Switch checked={urgent} onChange={setUrgent} label="Urgent" />
            </div>
            <div className="ch-msp-set">
              <Switch checked={ack} onChange={setAck} label="Ask players to acknowledge" />
            </div>
          </div>
        </div>
      </div>
    </PhoneScreen>
  );
}
