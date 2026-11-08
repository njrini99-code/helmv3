'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, isUnread } from '../model';
import { chTrail } from '../../../lib/track';
import { useState } from 'react';
import type { MenuItem } from '../../../ui/Menu';
import { MessageSquare, PinOff, Pin, MailOpen, Mail, BellOff, Bell, Trash2 } from 'lucide-react';
import { useToast } from '../../../ui/Toast';
import { DeleteConversationModal } from '../details/group-modals';
import { ConvRowButton } from './ConvRowButton';
import { SwipeRow } from '../../../ui/SwipeRow';
import { MuteMenu, muteAnchor, muteToast } from '../details-v2';
import { useRowMenu } from './row-menu';
import type { GlassAnchor } from '../overlays/GlassMenu';

/** A menu anchor as a rectangle: an element's box, or a point (a right click) with no size. */
function boxOf(a: GlassAnchor): { left: number; top: number; bottom: number } {
  if (typeof HTMLElement !== 'undefined' && a instanceof HTMLElement) return a.getBoundingClientRect();
  if ('x' in a && 'y' in a && !('width' in a)) return { left: a.x, top: a.y, bottom: a.y };
  return a as DOMRect;
}

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
  const toast = useToast();
  const [muting, setMuting] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [deleting, setDeleting] = useState<boolean | null>(null);
  /** One toast per mute change, replacing a live one (MSG-604). A failure toasts through the container's own `attempt`. */
  const setMute = async (on: boolean, hours: number | null) => {
    setMuting(null);
    const ok = await api.muteConversation(c.id, on, hours);
    if (ok !== false) toast({ title: muteToast(on, hours), replace: 'mute' });
  };
  const toggleRead = () => {
    chTrail(unread ? "messages mark read" : "messages mark unread");
    void api.setRead(c.id, unread);
  };
  const askDelete = api.deleteConversation && !c.channel ? () => setDeleting(true) : null;
  // Owner decision 14: the row's actions, each on this row's conversation whether or not it is the open one. Right-click
  // and Shift+F10 on the desktop; on the phone a 500ms long press, a keyboard's Shift+F10 or the VoiceOver button below
  // open the same rows in C's glass menu (MSG-111, row-menu.tsx). The phone's swipes repeat Mark as read/unread and Delete.
  const itemsAt = (anchor: GlassAnchor): MenuItem[] => [
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
      // D's mute menu opens under the row (MSG-604); a muted conversation just unmutes.
      c.muted ? { label: "Unmute", icon: Bell, onSelect: () => void setMute(false, null) } : { label: "Mute…", icon: BellOff, onSelect: () => setMuting(muteAnchor(boxOf(anchor))) },
      ...(askDelete ? [{ kind: "separator" as const }, { label: "Delete conversation", icon: Trash2, danger: true, onSelect: askDelete }] : []),
  ];
  const ctx = useRowMenu<ChConv>({
    label: (row) => `Actions for ${row.title}`,
    items: (_row, anchor) => itemsAt(anchor),
    touchHold: phone,
  });
  const sheets = (
    <>
      {ctx.menu}
      {muting && <MuteMenu anchor={muting} onPick={(hours) => void setMute(true, hours)} onClose={() => setMuting(null)} />}
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
          <button type="button" onClick={(e) => ctx.openAt(c, e.currentTarget)}>
            Actions for {c.title}
          </button>
        </span>
      </SwipeRow>
      {sheets}
    </>
  );
}
