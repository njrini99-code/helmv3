import * as React from 'react';
import '@/app/globals.css';
import '@/styles/design-tokens.css';

import { MessageConversationRail } from '@/components/fairway/pages/messages/MessageConversationRail';
import { MessageThreadPane } from '@/components/fairway/pages/messages/MessageThreadPane';
import { MessageComposer } from '@/components/fairway/pages/messages/MessageComposer';
import { FairwayNewMessageSheet } from '@/components/fairway/pages/messages/FairwayNewMessageSheet';
import { fixturePeople, type FixtureId } from './fixtures';

const conversation = {
  id: 'conv-practice',
  created_at: '2026-09-04T12:00:00.000Z',
  updated_at: '2026-09-04T14:42:00.000Z',
  unread_count: 3,
  is_group: true,
  title: 'Tournament travel plans and pairing notes',
  participant_count: 4,
  last_message: {
    id: 'm-rail-preview',
    sender_id: fixturePeople.alex.userId,
    content: 'Rooming preferences are ready for review.',
    created_at: '2026-09-04T14:42:00.000Z',
    conversation_id: 'conv-practice',
    edited_at: null,
    has_attachments: false,
    is_deleted: false,
    kind: 'text',
    payload: null,
    pinned_at: null,
    pinned_by: null,
    read: false,
    reply_to_id: null,
  },
};

const groupParticipants = new Map([
  [fixturePeople.alex.userId, { name: fixturePeople.alex.name, avatar: fixturePeople.alex.avatar }],
  [fixturePeople.jordan.userId, { name: fixturePeople.jordan.name, avatar: fixturePeople.jordan.avatar }],
  [fixturePeople.coach.userId, { name: fixturePeople.coach.name, avatar: fixturePeople.coach.avatar }],
]);

function message(id: string, sender_id: string, content: string, created_at: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sender_id,
    content,
    created_at,
    conversation_id: conversation.id,
    edited_at: null,
    has_attachments: false,
    is_deleted: false,
    kind: 'text',
    payload: null,
    pinned_at: null,
    pinned_by: null,
    read: true,
    reply_to_id: null,
    ...extra,
  };
}

const shortGroupMessages = [
  message('m-alex-1', fixturePeople.alex.userId, 'I can leave campus right after class Friday.', '2026-09-04T13:05:00.000Z'),
  message('m-alex-2', fixturePeople.alex.userId, 'My clubs are already in the travel case.', '2026-09-04T13:06:00.000Z'),
  message('m-jordan-1', fixturePeople.jordan.userId, 'I can share my rooming preference after practice.', '2026-09-04T13:11:00.000Z'),
  message('m-coach-1', fixturePeople.coach.userId, 'Perfect — please add that before dinner.', '2026-09-04T13:15:00.000Z', { reply_to_id: 'm-alex-2', isRead: true }),
];

const failedSendMessages = [
  message('m-alex-1', fixturePeople.alex.userId, 'Do we need our rain gear for Saturday?', '2026-09-04T14:35:00.000Z'),
  message('m-coach-failed', fixturePeople.coach.userId, 'Yes. Pack it with your tournament layers.', '2026-09-04T14:36:00.000Z', {
    reply_to_id: 'm-alex-1',
    sendState: 'failed',
  }),
];

const noop = () => undefined;
const asyncSuccess = async () => true;

function ThreadFixture({ failed }: { failed: boolean }) {
  const [mobileActionsId, setMobileActionsId] = React.useState<string | null>(null);
  const [editContent, setEditContent] = React.useState('');
  return (
    <MessageThreadPane
      conversation={conversation}
      messages={(failed ? failedSendMessages : shortGroupMessages) as never[]}
      loading={false}
      threadVisible
      userId={fixturePeople.coach.userId}
      currentUserId={fixturePeople.coach.userId}
      isOtherTyping={false}
      typingUserIds={[]}
      onBack={noop}
      onNewMessage={noop}
      editingMessageId={null}
      editContent={editContent}
      isEditSaving={false}
      deleteConfirmId={null}
      mobileActionsId={mobileActionsId}
      onStartEdit={noop}
      onEditContentChange={setEditContent}
      onCancelEdit={noop}
      onSaveEdit={noop}
      onDeleteClick={noop}
      onConfirmDelete={noop}
      onCancelDelete={noop}
      onSetMobileActions={setMobileActionsId}
      onReply={noop}
      onJumpToMessage={noop}
      onRetryMessage={noop}
      groupParticipants={groupParticipants}
      className="h-[100dvh]"
    >
      <MessageComposer
        onSend={asyncSuccess}
        replyTo={failed ? { name: fixturePeople.alex.name, preview: failedSendMessages[0].content } : null}
        onCancelReply={noop}
      />
    </MessageThreadPane>
  );
}

function InboxFixture() {
  return (
    <MessageConversationRail
      conversations={[
        conversation,
        {
          id: 'conv-direct',
          created_at: '2026-09-03T12:00:00.000Z',
          updated_at: '2026-09-03T12:00:00.000Z',
          unread_count: 0,
          participant_count: 2,
          is_group: false,
          other_participant: fixturePeople.taylor,
          last_message: message('m-direct', fixturePeople.taylor.userId, 'See you at lift.', '2026-09-03T12:00:00.000Z'),
        },
      ] as never[]}
      selectedId={conversation.id}
      onSelect={noop}
      onNewMessage={noop}
      className="min-h-screen"
    />
  );
}

function NewPrivateGroupFixture() {
  return (
    <FairwayNewMessageSheet
      isOpen
      onClose={noop}
      onCreateConversation={async () => undefined}
      currentUserRole="coach"
      teamId="team-fixture"
    />
  );
}

function currentFixture(): FixtureId {
  const fixture = new URLSearchParams(window.location.search).get('fixture');
  if (fixture === 'inbox-unread-group' || fixture === 'thread-short-group' || fixture === 'thread-failed-send' || fixture === 'new-private-group') {
    return fixture;
  }
  return 'inbox-unread-group';
}

export function App() {
  const fixture = currentFixture();
  return (
    <main className="fairway-ds min-h-screen bg-canvas p-0 text-text-primary" data-fixture={fixture}>
      {fixture === 'inbox-unread-group' ? <InboxFixture /> : null}
      {fixture === 'thread-short-group' ? <ThreadFixture failed={false} /> : null}
      {fixture === 'thread-failed-send' ? <ThreadFixture failed /> : null}
      {fixture === 'new-private-group' ? <NewPrivateGroupFixture /> : null}
    </main>
  );
}
