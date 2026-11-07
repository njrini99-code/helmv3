'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChMsg, MESSAGE_MAX } from '../model';
import { useState, useEffect } from 'react';
import { Modal } from '../../../ui/Modal';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../../ui/Button';

/** Edit your own message (desktop modal; a sheet on the phone). */
export function EditMessageModal({ api, message, onClose }: { api: ChMessagesApi; message: ChMsg | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (message) setText(message.text);
  }, [message]);
  // Nothing changed is nothing to save: Save would only mark it Edited (wave 5 #9).
  const same = !!message && text.trim() === message.text.trim();
  return (
    <Modal
      open={message != null}
      onClose={onClose}
      icon={Pencil}
      title="Edit message"
      initialFocus=".ch-modal__body textarea"
      description="Everyone in the conversation sees it marked as edited."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!text.trim() || same}
            onClick={async () => {
              if (!message || same) return;
              setBusy(true);
              const ok = await api.edit(message.id, text.trim());
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <textarea
        className="ch-textarea"
        rows={4}
        aria-label="Message"
        value={text}
        maxLength={MESSAGE_MAX}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}

/** Delete your own message, after a confirm (CH-7501). */
export function DeleteMessageModal({ api, message, onClose }: { api: ChMessagesApi; message: ChMsg | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7501"
      open={message != null}
      onClose={onClose}
      icon={Trash2}
      title="Delete this message?"
      description="It’s removed for everyone in the conversation. This can’t be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            onClick={async () => {
              if (!message) return;
              setBusy(true);
              const ok = await api.remove(message.id);
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy ? "Deleting…" : "Delete message"}
          </Button>
        </>
      }
    >
      {/* Which message, quoted and clamped to three lines (wave 5 #14). */}
      {message && (
        <blockquote className="ch-ms-delq">
          {message.text || (message.hasAttachments ? "Attachment" : "Message")}
        </blockquote>
      )}
    </Modal>
  );
}
