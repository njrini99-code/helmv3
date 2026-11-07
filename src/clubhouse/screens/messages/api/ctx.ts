import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useRouter } from 'next/navigation';
import type { useNotificationBadges } from '@/contexts/notification-badge-context';
import type { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import type { useMessageReactions } from '@/hooks/golf/use-message-reactions';
import type { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import type { useMessageResponses } from '@/hooks/golf/use-message-responses';
import type { ChMessagesData } from '../../../data/messages';
import type { useToast } from '../../../ui/Toast';
import type { useConversationTeam } from '../../../lib/use-conversation-team';
import type { useTeamClassDay } from '../../../lib/use-class-day';
import type { useConversationPins } from '../use-conversation-pins';
import type { useRowMutes } from '../use-row-mutes';
import type { useTypingByConversation } from '../use-typing-by-conversation';
import type { ChAnnouncement, ChConv, ChMember, ChMsg, ChMute } from '../model';
import type { ChAttachmentRecovery, ChMessagesApi } from './types';

/** A message waiting in New message (prefill.ts): the recipients, the draft and the group's name. */
export type ChPrefill = { to: string[]; draft: string; title: string };

/**
 * What the `ChMessagesApi` slices read from the `Messages` container: its state, hook results and the shared
 * `attempt` / `fail` wrappers. The container builds it once per render and hands it to `useInboxApi`, `useThreadApi`,
 * `useOverlayApi` and `useDetailsApi`, whose results it spreads into the one `api` object. Add a field here only when
 * a slice needs it; the container stays the single owner of state (package B).
 */
export interface MessagesApiCtx {
  data: ChMessagesData;
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>;
  hours: ChMessagesApi['clock'];

  // The conversation list.
  conversations: ReturnType<typeof useGolfConversations>['conversations'];
  loading: boolean;
  error: ReturnType<typeof useGolfConversations>['error'];
  refetch: ReturnType<typeof useGolfConversations>['refetch'];
  convs: ChConv[];
  shownConvs: ChConv[];
  selected: ChConv | null;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setStarted: Dispatch<SetStateAction<ChConv | null>>;
  autoOpened: string | null;
  setAutoOpened: Dispatch<SetStateAction<string | null>>;
  select: (id: string | null) => void;
  mark: (id: string, unread: boolean) => void;
  badges: ReturnType<typeof useNotificationBadges>;
  pins: ReturnType<typeof useConversationPins>;
  rowMutes: ReturnType<typeof useRowMutes>;
  typingByConv: ReturnType<typeof useTypingByConversation>;

  // The open thread.
  msgs: ReturnType<typeof useGolfMessages>;
  chMsgs: ChMsg[];
  drafts: Map<string, string>;
  attachmentRecovery: Map<string, ChAttachmentRecovery>;
  classOn: boolean;
  teamClass: ReturnType<typeof useTeamClassDay>;
  convTeamId: ReturnType<typeof useConversationTeam>;
  sendMessageWithAttachments: ReturnType<typeof useMessageAttachments>['sendMessageWithAttachments'];
  getPendingAttachmentSend: ReturnType<typeof useMessageAttachments>['getPendingAttachmentSend'];
  retryPendingAttachmentSend: ReturnType<typeof useMessageAttachments>['retryPendingAttachmentSend'];

  // Reactions and polls.
  reactions: ReturnType<typeof useMessageReactions>;
  reactionMap: ChMessagesApi['reactions'];
  responses: ReturnType<typeof useMessageResponses>;

  // Search and focus.
  searchMessages: ChMessagesApi['searchMessages'];
  focusMessageId: string | null;
  setFocusMessageId: Dispatch<SetStateAction<string | null>>;
  foundMessageId: string | null;
  setFoundMessageId: Dispatch<SetStateAction<string | null>>;

  // Members, mute, files, New message.
  members: ChMember[] | null;
  setMembers: Dispatch<SetStateAction<ChMember[] | null>>;
  membersError: boolean;
  setMembersAttempt: Dispatch<SetStateAction<number>>;
  quietMembers: MutableRefObject<boolean>;
  addCandidates: ChMessagesApi['addCandidates'];
  canHide: boolean;
  mute: ChMute | null;
  muteError: boolean;
  setMuteAttempt: Dispatch<SetStateAction<number>>;
  muteOf: (id: string) => Promise<ChMute | null>;
  muteConversation: (id: string, muted: boolean, hours: number | null) => Promise<boolean>;
  loadFiles: ChMessagesApi['files'];
  loadAttachments: ChMessagesApi['attachments'];
  landDraft: (id: string) => void;
  startDirect: (userId: string) => Promise<boolean>;
  createGroup: ChMessagesApi['createGroup'];
  prefill: ChPrefill | null;
  setPrefill: Dispatch<SetStateAction<ChPrefill | null>>;
  pendingDraft: MutableRefObject<string | null>;

  // Announcements.
  anns: ChAnnouncement[];
  annError: boolean;
  annLoaded: boolean;
  selectedAnnId: string | null;
  setSelectedAnnId: Dispatch<SetStateAction<string | null>>;
  loadAnns: () => Promise<void>;
  announcementDetail: ChMessagesApi['announcementDetail'];

  // Wrappers every write goes through.
  attempt: (surface: string, copy: { failed: string; hint: string; code: string }, fn: () => Promise<boolean | void>) => Promise<boolean>;
  fail: (surface: string, err: unknown, title: string, hint: string, code: string, withReason?: boolean) => void;
}
