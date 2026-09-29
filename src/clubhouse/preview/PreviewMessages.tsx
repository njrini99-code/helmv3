'use client';

import { useMemo, useState } from 'react';
import { MessagesView, type ChMessagesApi } from '../screens/messages/MessagesView';
import type { ChConv, ChMember, ChMsg, ChPerson, ChReaction, ChReactionKey } from '../screens/messages/model';
import { useToast } from '../ui/Toast';

/**
 * The handoff's Messages sample (design/handoff/msg-data.js), driven by local
 * state so every interaction works in the no-auth preview: send, react,
 * edit, delete, new direct and group threads. Today is Tue 14 Oct 2026, 2:40 PM Eastern.
 */
const NOW = '2026-10-14T18:40:00Z';
const TZ = 'America/New_York';
const at = (day: number, h: number, m: number) => new Date(Date.UTC(2026, 9, day, h + 4, m)).toISOString();

const people: ChPerson[] = [
  { userId: 'dan', name: 'Dan Whitfield', role: 'coach', subtitle: 'Assistant coach', playerId: null },
  { userId: 'ava', name: 'Ava Lindqvist', role: 'player', subtitle: 'Junior', playerId: 'p-ava' },
  { userId: 'eli', name: 'Eli Brandt', role: 'player', subtitle: 'Junior', playerId: 'p-eli' },
  { userId: 'jonah', name: 'Jonah Okafor', role: 'player', subtitle: 'Sophomore', playerId: 'p-jonah' },
  { userId: 'priya', name: 'Priya Natarajan', role: 'player', subtitle: 'Freshman', playerId: 'p-priya' },
  { userId: 'sofia', name: 'Sofia Alvarez', role: 'player', subtitle: 'Senior', playerId: 'p-sofia' },
  { userId: 'theo', name: 'Theo Marchetti', role: 'player', subtitle: 'Senior', playerId: 'p-theo' },
];
const all = ['dan', 'theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'];

const baseConvs: ChConv[] = [
  { id: 'team', group: true, title: 'Varsity team', subtitle: '', memberIds: all, memberCount: 8, unread: 3, lastAt: at(14, 14, 31), lastSenderId: 'ava', lastText: 'Does the bus leave from Finley or the field house?', creatorId: 'me' },
  { id: 'jonah', group: false, title: 'Jonah Okafor', subtitle: 'Sophomore', memberIds: ['jonah'], memberCount: 2, unread: 1, lastAt: at(14, 13, 58), lastSenderId: 'jonah', lastText: 'Can we push to 5? I have ECON until 2:15 and then a TA meeting.', creatorId: 'me' },
  { id: 'travel', group: true, title: 'Pinehurst travel', subtitle: '', memberIds: all, memberCount: 8, unread: 0, lastAt: at(14, 11, 4), lastSenderId: 'me', lastText: 'Room list is pinned. Two to a room, same as Wolfpack.', creatorId: 'me' },
  { id: 'dan', group: false, title: 'Dan Whitfield', subtitle: 'Assistant coach', memberIds: ['dan'], memberCount: 2, unread: 0, lastAt: at(14, 9, 20), lastSenderId: 'dan', lastText: 'I can run the short-game block if you take Jonah.', creatorId: 'dan' },
  { id: 'eli', group: false, title: 'Eli Brandt', subtitle: 'Junior', memberIds: ['eli'], memberCount: 2, unread: 0, lastAt: at(13, 16, 10), lastSenderId: 'me', lastText: 'You need two posted rounds before Thursday.', creatorId: 'me' },
  { id: 'priya', group: false, title: 'Priya Natarajan', subtitle: 'Freshman', memberIds: ['priya'], memberCount: 2, unread: 0, lastAt: at(13, 19, 44), lastSenderId: 'priya', lastText: 'Thank you coach. I will be at the ladder.', creatorId: 'me' },
  { id: 'theo', group: false, title: 'Theo Marchetti', subtitle: 'Senior', memberIds: ['theo'], memberCount: 2, unread: 0, lastAt: at(11, 17, 2), lastSenderId: 'theo', lastText: 'Sent you the Arccos export from Oakmont.', creatorId: 'me' },
  { id: 'sofia', group: false, title: 'Sofia Alvarez', subtitle: 'Senior', memberIds: ['sofia'], memberCount: 2, unread: 0, lastAt: at(8, 20, 15), lastSenderId: 'me', lastText: 'Good round. Keep the same pre-shot on 16.', creatorId: 'me' },
];

const msg = (id: string, senderId: string, when: string, text: string, extra: Partial<ChMsg> = {}): ChMsg => ({
  id,
  senderId,
  text,
  at: when,
  mine: senderId === 'me',
  seen: senderId === 'me',
  failed: null,
  edited: false,
  deleted: false,
  hasAttachments: false,
  ...extra,
});

const baseThreads: Record<string, ChMsg[]> = {
  team: [
    msg('t1', 'me', at(13, 18, 12), 'Pairings for Thursday are posted in Documents. First tee 8:42.'),
    msg('t2', 'me', at(13, 18, 13), 'Bus leaves at 6:15 sharp. Breakfast on the bus.'),
    msg('t3', 'theo', at(13, 18, 20), 'Are we walking or carts for the practice round?'),
    msg('t4', 'dan', at(13, 18, 24), 'Walking. Push carts are in the cage, one per player.'),
    msg('t5', 'priya', at(14, 13, 40), 'Is the putting ladder still on at 5:30?'),
    msg('t6', 'me', at(14, 13, 52), 'Yes. Green 2, bring three balls and a tee for the gate drill.'),
    msg('t7', 'sofia', at(14, 14, 18), 'Can I get a ride back Friday? My parents are driving to the second round.'),
    msg('t8', 'ava', at(14, 14, 31), 'Does the bus leave from Finley or the field house?'),
  ],
  jonah: [
    msg('j1', 'me', at(14, 12, 30), 'Let’s do a 1:1 at 4:45 in bay 4. We’ll work 125 to 150 with the launch monitor.'),
    msg('j2', 'jonah', at(14, 13, 58), 'Can we push to 5? I have ECON until 2:15 and then a TA meeting.'),
  ],
  travel: [
    msg('v1', 'me', at(14, 11, 2), '', { hasAttachments: true }),
    msg('v2', 'me', at(14, 11, 4), 'Room list is pinned. Two to a room, same as Wolfpack.'),
  ],
  dan: [msg('d1', 'dan', at(14, 9, 20), 'I can run the short-game block if you take Jonah.')],
  eli: [msg('e1', 'me', at(13, 16, 10), 'You need two posted rounds before Thursday.')],
  priya: [msg('p1', 'priya', at(13, 19, 44), 'Thank you coach. I will be at the ladder.')],
  theo: [msg('h1', 'theo', at(11, 17, 2), 'Sent you the Arccos export from Oakmont.')],
  sofia: [msg('s1', 'me', at(8, 20, 15), 'Good round. Keep the same pre-shot on 16.')],
};

const baseReactions: Record<string, ChReaction[]> = {
  t2: [{ key: 'Like', count: 5, mine: false }],
  v2: [
    { key: 'Like', count: 6, mine: false },
    { key: 'Thanks', count: 2, mine: false },
  ],
};

const previewAttachments = async () => [{ id: 'a1', name: 'Room list · Pinehurst.pdf', size: 48 * 1024, mime: 'application/pdf', url: null }];

export function PreviewMessages({ state }: { state?: string }) {
  const toast = useToast();
  const [convs, setConvs] = useState<ChConv[]>(state === 'empty' ? [] : baseConvs);
  const [threads, setThreads] = useState(baseThreads);
  const [reactions, setReactions] = useState(baseReactions);
  const [selectedId, setSelectedId] = useState<string | null>(state === 'empty' || state === 'rail' ? null : 'team');

  const members: ChMember[] = useMemo(
    () => [{ userId: 'me', name: 'Maya Reyes', subtitle: 'Head coach', role: 'coach' as const }, ...people.map((p) => ({ userId: p.userId, name: p.name, subtitle: p.subtitle, role: p.role }))],
    [],
  );

  const api: ChMessagesApi = {
    viewer: { userId: 'me', role: 'coach', name: 'Maya Reyes' },
    timeZone: TZ,
    now: NOW,
    teamName: 'Varsity',
    convs,
    convsLoading: state === 'loading',
    convsError: state === 'failed',
    refetchConvs: () => toast({ title: 'Refreshed' }),
    selectedId,
    select: (id) => {
      setSelectedId(id);
      if (id) setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    },
    msgs: selectedId ? (threads[selectedId] ?? []) : [],
    msgsLoading: false,
    msgsError: state === 'thread-failed',
    refetchMsgs: () => undefined,
    typing: selectedId === 'team',
    onTyping: () => undefined,
    send: async (text) => {
      if (!selectedId) return false;
      const m = msg(`n${Date.now()}`, 'me', NOW, text, { seen: false });
      setThreads((t) => ({ ...t, [selectedId]: [...(t[selectedId] ?? []), m] }));
      setConvs((cs) => {
        const c = cs.find((x) => x.id === selectedId)!;
        return [{ ...c, lastAt: NOW, lastSenderId: 'me', lastText: text }, ...cs.filter((x) => x.id !== selectedId)];
      });
      return true;
    },
    sendFiles: async () => {
      toast({ tone: 'error', title: "Couldn't send the attachment", body: 'The preview has no storage. Files send in the app.' });
      return false;
    },
    retry: () => undefined,
    discard: () => undefined,
    edit: async (id, text) => {
      setThreads((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.map((m) => (m.id === id ? { ...m, text, edited: true } : m))])));
      toast({ title: 'Message edited' });
      return true;
    },
    remove: async (id) => {
      setThreads((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.map((m) => (m.id === id ? { ...m, deleted: true, text: '' } : m))])));
      toast({ title: 'Message deleted' });
      return true;
    },
    reactions: new Map(Object.entries(reactions)),
    react: (messageId, key: ChReactionKey, active) =>
      setReactions((r) => {
        const list = [...(r[messageId] ?? [])];
        const i = list.findIndex((x) => x.key === key);
        if (i < 0 && active) list.push({ key, count: 1, mine: true });
        else if (i >= 0) {
          const x = list[i]!;
          list[i] = { ...x, count: x.count + (active ? 1 : -1), mine: active };
        }
        return { ...r, [messageId]: list.filter((x) => x.count > 0) };
      }),
    attachments: previewAttachments,
    members: members.filter((m) => m.userId === 'me' || all.includes(m.userId)),
    membersError: false,
    leave: async () => true,
    directory: people,
    directoryError: false,
    startDirect: async (userId) => {
      const existing = convs.find((c) => !c.group && c.memberIds[0] === userId);
      if (existing) {
        setSelectedId(existing.id);
        return true;
      }
      const p = people.find((x) => x.userId === userId)!;
      const c: ChConv = { id: `c-${userId}`, group: false, title: p.name, subtitle: p.subtitle, memberIds: [userId], memberCount: 2, unread: 0, lastAt: NOW, lastSenderId: null, lastText: '', creatorId: 'me' };
      setConvs((cs) => [c, ...cs]);
      setSelectedId(c.id);
      return true;
    },
    createGroup: async (userIds, title) => {
      const c: ChConv = { id: `g-${Date.now()}`, group: true, title: title || 'Group', subtitle: '', memberIds: userIds, memberCount: userIds.length + 1, unread: 0, lastAt: NOW, lastSenderId: null, lastText: '', creatorId: 'me' };
      setConvs((cs) => [c, ...cs]);
      setSelectedId(c.id);
      toast({ title: `Group created · ${c.title}` });
      return true;
    },
  };
  return <MessagesView api={api} />;
}
