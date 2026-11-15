import type { ChConvFilter, ChConv, ChMsg, ChReaction, ChReactionKey, ChAttachment, ChMember, ChFile, ChPerson, ChSearchHit, ChMute, ChAnnouncement, ChAnnouncementDetail, ChReceipts } from '../model';
import type { ChPins } from '../pinned';
import type { ChClock } from '../../../lib/clock-cookie';
import type { ChThreadClassDay } from '../class-thread';
import type { ChPollsApi } from '../polls';

export interface ChPendingAttachmentSend {
  id: string;
  text: string;
  replyToId: string | null;
  filenames: string[];
}

export interface ChAttachmentRecovery {
  text: string;
  files: File[];
  replyToId?: string | null;
  queuedText: string;
  queuedFiles: File[];
  resumed?: ChPendingAttachmentSend | null;
}

export interface ChMessagesApi {
  /** golf_messages_redesign_v1, read on the server: the screens branch on it, and the root carries `data-ch-ms-v2`. */
  /** Set once by a handoff from Ask: the phone's back key returns there, the one time (W-MSG-16). */
  leaveToAsk?: () => void;
  /** The design fixture's starting filter (`view=unread`). */
  designFilter?: ChConvFilter;
  /** Redesign only: who is typing in the open thread, one bubble each. */
  typingUserIds?: string[];
  /** Redesign only: this device's pins (pinned.ts; account-wide with 11h). */
  pins?: ChPins;
  /** Redesign only: who is typing in each conversation on screen (use-typing-by-conversation.ts). */
  typingByConv?: ReadonlyMap<string, string[]>;
  viewer: { userId: string; role: "coach" | "player"; name: string };
  /** Coaches by golf_coaches.id, for an announcement's signature (P007-A1). */
  signers?: Record<string, { name: string; title: string }>;
  timeZone: string;
  /** The device's clock for message times; a test's partial api leaves it out and times read in 12 hours. */
  clock?: ChClock;
  now: string;
  teamName: string | null;

  convs: ChConv[];
  convsLoading: boolean;
  convsError: boolean;
  refetchConvs: () => void;

  /**
   * Unsent drafts by conversation id, kept by the container so switching
   * threads never loses what was written (P007 71202). Cleared when a send lands.
   */
  drafts: Map<string, string>;
  /** Unknown attachment attempts survive leaving/reopening a conversation in this mounted session. */
  attachmentRecovery?: Map<string, ChAttachmentRecovery>;
  loadPendingAttachmentSend?: () => Promise<ChPendingAttachmentSend | null>;
  retryPendingAttachmentSend?: () => Promise<boolean | "partial" | "unknown">;

  selectedId: string | null;
  select: (id: string | null) => void;

  msgs: ChMsg[];
  msgsLoading: boolean;
  msgsError: boolean;
  /** The thread's refresh failed while an earlier copy is shown (CH-7216). */
  msgsStale?: boolean;
  refetchMsgs: () => void;
  typing: boolean;
  onTyping: (on: boolean) => void;
  /** `notifyAnyway` is the coach's choice to interrupt (P-10); the composer offers it only in a later step, with class holds. */
  send: (text: string, replyToId?: string | null, sendOptions?: { notifyAnyway?: boolean }) => Promise<boolean>;
  sendFiles: (text: string, files: File[], replyToId?: string | null) => Promise<boolean | "partial" | "unknown">;
  retry: (id: string) => void;
  discard: (id: string) => void;
  edit: (id: string, text: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;

  reactions: Map<string, ChReaction[]>;
  react: (messageId: string, key: ChReactionKey, active: boolean) => void;
  attachments: (messageId: string) => Promise<ChAttachment[] | null>;

  members: ChMember[] | null;
  membersError: boolean;
  retryMembers: () => void;
  leave: () => Promise<boolean>;
  /**
   * Hides a conversation from the viewer's own inbox (CH-7025 when it fails): the open one's details, or any row's
   * menu and the phone's trailing swipe (owner decision 14). Null until the database supports it.
   */
  deleteConversation: ((conversationId: string) => Promise<boolean>) | null;
  /** The open group's creator only: who on the team isn't in it yet, and adding one (D-47). */
  addCandidates: () => Promise<ChMember[] | null>;
  addMember: (userId: string, name: string) => Promise<boolean>;
  /**
   * The open group's creator only, never on their own row (removeGolfGroupMember, as Fairway's group details allow):
   * after a confirm (CH-7504) the row leaves at once and comes back if the server refuses (CH-7024). Absent in the
   * preview.
   */
  removeMember?: (userId: string, name: string) => Promise<boolean>;
  /** The open conversation's shared files, newest first (D-48). */
  files: (conversationId: string) => Promise<ChFile[] | null>;

  /**
   * P-10 class awareness, a coach only: the team's class day for the thread's class line. Absent (or null) when the
   * flag is off, the viewer is a player, or the migrations are not applied: the header is then exactly as before.
   */
  classDay?: ChThreadClassDay | null;

  directory: ChPerson[];
  directoryError: boolean;
  retryDirectory: () => void;
  startDirect: (userId: string) => Promise<boolean>;
  createGroup: (userIds: string[], title: string) => Promise<boolean>;
  /** A prefilled message (prefill.ts) waiting for New message: who it's to (user ids), the draft and the group's name. */
  prefill?: { to: string[]; draft: string; title: string } | null;
  clearPrefill?: () => void;

  searchMessages: (q: string) => Promise<ChSearchHit[] | null>;
  openHit: (hit: ChSearchHit) => void;
  /** A search hit the open thread should go to (useFocusMessage); the end-anchor is paused while it is set. */
  focusMessageId?: string | null;
  /** The hit the thread came to, marked for a moment (FOUND_FOR_MS). */
  foundMessageId?: string | null;
  /** The thread came to the hit (its id), or gave up on one outside the loaded history (null). */
  messageFocused?: (id: string | null) => void;

  mute: ChMute | null;
  muteError: boolean;
  retryMute: () => void;
  setMute: (muted: boolean, hours: number | null) => Promise<boolean>;
  /** Any conversation's mute, read when a row's Mute sheet opens (owner decision 14); null when it didn't load. */
  muteOf: (conversationId: string) => Promise<ChMute | null>;
  /** Mutes or unmutes any conversation by id, from a row's menu; the open one's `mute` follows. */
  muteConversation: (conversationId: string, muted: boolean, hours: number | null) => Promise<boolean>;
  /**
   * A row's Mark as read / Mark as unread (owner decision 14). Read clears the server's count (markGolfMessagesAsRead);
   * unread is this device's own mark (marked-unread.ts), cleared when the conversation opens.
   */
  setRead: (conversationId: string, read: boolean) => Promise<boolean>;

  announcements: ChAnnouncement[];
  /** The first announcements read hasn't answered: the list waits, so they don't push it down when they land (CLS). */
  annLoading?: boolean;
  annError: boolean;
  refetchAnns: () => void;
  selectedAnnId: string | null;
  selectAnn: (id: string | null) => void;
  announcementDetail: (id: string) => Promise<ChAnnouncementDetail | null>;
  /**
   * A signed link to an announcement's attached document (getPreviewUrl), asked for at the tap; `url: null` when it
   * can't be had (`noContent`: the document has no stored file). Absent in the preview, which opens its fixture's `url`.
   */
  openAnnouncementDocument?: (documentId: string) => Promise<{ url: string | null; noContent?: boolean }>;
  acknowledge: (id: string) => Promise<boolean>;
  completeTask: (announcementId: string, taskId: string) => Promise<boolean>;
  createAnnouncement: (a: {
    title: string;
    body: string;
    urgent: boolean;
    ack: boolean;
  }) => Promise<boolean>;
  /** Polls in group threads (P-2): the votes, voting, sending and closing. Absent where polls aren't offered. */
  polls?: ChPollsApi;
  /** Seen by (P-1): the open conversation's read map. Absent in a fixture or where receipts aren't drawn. */
  receipts?: ChReceipts;
}
