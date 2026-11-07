'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, isUnread, type ChMute } from '../model';
import { chTrail } from '../../../lib/track';
import { useState, useEffect } from 'react';
import type { MenuItem } from '../../../ui/Menu';
import { MessageSquare, PinOff, Pin, MailOpen, Mail, BellOff, Trash2 } from 'lucide-react';
import { useContextMenu } from '../../../ui/ContextMenu';
import { DeleteConversationModal } from '../details/group-modals';
import { ConvRowButton } from './ConvRowButton';
import { SwipeRow } from '../../../ui/SwipeRow';
import { Modal } from '../../../ui/Modal';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton } from '../../../ui/States';
import { Icon } from '../../../ui/Icon';
import { muteLabel } from '../details/mute-label';
import { Button } from '../../../ui/Button';

/* Rail */

/**
 * One conversation's actions (owner decision 14, MSG-111, Q-39), for a list row and for a pinned tile: the menu's items,
 * the context-menu binding that opens them, and the row's own sheets. The team's channel is always pinned and the server
 * refuses to hide it, so it is offered neither Pin nor Delete.
 */
export function useConvActions(api: ChMessagesApi, c: ChConv, phone: boolean) {
  const open = () => {
    // D-70: opening a conversation is plain navigation, so it is silent (F-0071).
    chTrail("messages open conversation");
    api.select(c.id);
  };
  const unread = isUnread(c);
  // The row's own sheets, mounted once first asked for, so a long inbox doesn't hold two dialogs per row.
  const [muting, setMuting] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState<boolean | null>(null);
  const toggleRead = () => {
    chTrail(unread ? "messages mark read" : "messages mark unread");
    void api.setRead(c.id, unread);
  };
  const askDelete = api.deleteConversation && !c.channel ? () => setDeleting(true) : null;
  // Owner decision 14: the row's actions, each on this row's conversation whether or not it is the open one. Right-click
  // and Shift+F10 on the desktop; on the phone a 500ms long press, a keyboard's Shift+F10 or the VoiceOver button below
  // open the same rows as a sheet (ui/ContextMenu.tsx). The phone's swipes repeat Mark as read/unread and Delete.
  const rowItems: MenuItem[] = [
      { label: "Open conversation", icon: MessageSquare, onSelect: open },
      // Redesign: Pin after Open (drawn order). At three pins it stays in the menu, dimmed, saying why (PIN-SYNC D7).
      // The channel is pinned first for everyone (Q-11), so it has no row for it.
      ...(api.pins && !c.channel
        ? [
            api.pins.has(c.id)
              ? { label: "Unpin", icon: PinOff, onSelect: () => api.pins!.toggle(c.id) }
              : { label: "Pin", icon: Pin, caption: api.pins.atLimit ? "Pin up to 3" : undefined, disabled: api.pins.atLimit, onSelect: () => api.pins!.toggle(c.id) },
          ]
        : []),
      { label: unread ? "Mark as read" : "Mark as unread", icon: unread ? MailOpen : Mail, onSelect: toggleRead },
      { label: "Mute…", icon: BellOff, onSelect: () => setMuting(true) },
      ...(askDelete ? [{ kind: "separator" as const }, { label: "Delete conversation", icon: Trash2, danger: true, onSelect: askDelete }] : []),
  ];
  const ctx = useContextMenu<ChConv>({
    label: (row) => `Actions for ${row.title}`,
    title: (row) => row.title,
    touchHold: phone,
    anchored: true,
    items: () => (rowItems.map((item) => (item.kind === "separator" ? item : { ...item, icon: undefined }))),
  });
  const sheets = (
    <>
      {ctx.menu}
      {muting != null && <RowMuteModal api={api} c={c} open={muting} onClose={() => setMuting(false)} />}
      {deleting != null && <DeleteConversationModal api={api} conv={c} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => {}} />}
    </>
  );
  return { ctx, sheets, open, unread, toggleRead, askDelete };
}

/** One conversation in the list: the desktop rail and the phone inbox. */
export function ConvRow({ api, c, avatarSize = 40, phone = false }: { api: ChMessagesApi; c: ChConv; avatarSize?: number; phone?: boolean }) {
  const { ctx, sheets, open, unread, toggleRead, askDelete } = useConvActions(api, c, phone);
  if (!phone) {
    return (
      <>
        <ConvRowButton api={api} c={c} avatarSize={avatarSize} onOpen={open} bind={ctx.bind(c)} />
        {sheets}
      </>
    );
  }
  return (
    <>
      <SwipeRow
        className="ch-ms-swipe"
        onClaim={ctx.cancelHold}
        leading={{ label: unread ? "Read" : "Unread", icon: unread ? MailOpen : Mail, tone: "accent", run: toggleRead }}
        trailing={askDelete && { label: "Delete", icon: Trash2, tone: "danger", run: askDelete }}
      >
        <ConvRowButton api={api} c={c} avatarSize={avatarSize} onOpen={open} bind={ctx.bind(c)} plain />
        {/* VoiceOver and a keyboard can't swipe or hold: the same actions, one control away (shown when focused). */}
        <span className="ch-sr-only ch-sr-only--focusable">
          <button type="button" onClick={() => ctx.openSheet(c)}>
            Actions for {c.title}
          </button>
        </span>
      </SwipeRow>
      {sheets}
    </>
  );
}

/**
 * Mute or unmute one conversation from its row (owner decision 14): reads that conversation's mute as it opens, then
 * offers desktop's three lengths, or Unmute when it is already muted.
 */
function RowMuteModal({ api, c, open, onClose }: { api: ChMessagesApi; c: ChConv; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<ChMute | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const muteOf = api.muteOf;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setState(null);
    void muteOf(c.id).then((m) => {
      if (live) setState(m ?? "failed");
    });
    return () => {
      live = false;
    };
  }, [open, attempt, c.id, muteOf]);
  const set = async (muted: boolean, hours: number | null) => {
    setBusy(true);
    const ok = await api.muteConversation(c.id, muted, hours);
    setBusy(false);
    if (ok) onClose();
  };
  const muted = state != null && state !== "failed" && state.muted;
  return (
    <Modal
      code="CH-7607"
      open={open}
      onClose={onClose}
      icon={BellOff}
      title={muted ? `${c.title} is muted` : `Mute ${c.title}`}
      description={muted ? undefined : "No email, push or bell for it. Unread messages still show here."}
    >
      {state === "failed" ? (
        <InlineNotice code="CH-7208" title="The mute setting didn’t load" body="Try again." onRetry={() => setAttempt((n) => n + 1)} />
      ) : !state ? (
        <div aria-busy="true" data-ch-code="CH-7407">
          <Skeleton height={30} />
        </div>
      ) : state.muted ? (
        <div className="ch-ms-mute">
          <span>
            <Icon icon={BellOff} size={15} />
            {muteLabel(state, api)}
          </span>
          <Button size="sm" busy={busy} onClick={() => void set(false, null)}>
            Unmute
          </Button>
        </div>
      ) : (
        <div className="ch-ms-mute__opts">
          <Button size="sm" disabled={busy} onClick={() => void set(true, 8)}>
            Mute 8 hours
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void set(true, 24 * 7)}>
            Mute a week
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set(true, null)}>
            Until I turn it on
          </Button>
        </div>
      )}
    </Modal>
  );
}
