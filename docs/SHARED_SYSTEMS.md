# SHARED_SYSTEMS.md

## Shared Systems - Complete Implementation Guide

> **Duration:** 4-5 days
> **Prerequisites:** Foundation Phase complete
> **Goal:** Cross-cutting systems used by all user types

---

## Table of Contents

1. [Overview](#1-overview)
2. [Messaging System](#2-messaging-system)
3. [Notifications System](#3-notifications-system)
4. [Calendar System](#4-calendar-system)
5. [Public Profiles](#5-public-profiles)
6. [Global Search](#6-global-search)
7. [Real-Time Updates](#7-real-time-updates)
8. [API Routes & Server Actions](#8-api-routes--server-actions)

---

## 1. Overview

### 1.1 Shared Systems Summary

| System | Description | Users |
|--------|-------------|-------|
| Messaging | Coach-to-player, coach-to-coach conversations | All |
| Notifications | Bell icon alerts, email triggers | All |
| Calendar | Events, games, camps | Coaches + Players |
| Public Profiles | Player profiles, Program profiles | Public |
| Search | Global search across entities | All |
| Real-Time | Live updates via Supabase | All |

### 1.2 File Structure

```
app/
├── messages/
│   ├── page.tsx               # Messages inbox
│   └── [conversationId]/
│       └── page.tsx           # Conversation view
├── notifications/
│   └── page.tsx               # All notifications
├── calendar/
│   └── page.tsx               # Unified calendar
├── player/[id]/
│   └── page.tsx               # Public player profile
├── program/[id]/
│   └── page.tsx               # Public program profile
└── search/
    └── page.tsx               # Global search results

components/shared/
├── messaging/
│   ├── ConversationList.tsx
│   ├── ConversationView.tsx
│   ├── MessageBubble.tsx
│   ├── MessageInput.tsx
│   ├── NewConversationModal.tsx
│   └── MessageAttachment.tsx
├── notifications/
│   ├── NotificationBell.tsx
│   ├── NotificationDropdown.tsx
│   ├── NotificationItem.tsx
│   └── NotificationSettings.tsx
├── calendar/
│   ├── CalendarView.tsx
│   ├── EventCard.tsx
│   ├── EventModal.tsx
│   └── CalendarFilters.tsx
├── profiles/
│   ├── PublicPlayerProfile.tsx
│   ├── PublicProgramProfile.tsx
│   ├── ProfileHeader.tsx
│   └── ProfileStats.tsx
└── search/
    ├── GlobalSearch.tsx
    ├── SearchResults.tsx
    └── SearchFilters.tsx
```

---

## 2. Messaging System

### 2.1 Database Schema (Already in SCHEMA.md)

```sql
-- conversations table
-- messages table
-- conversation_participants table
```

### 2.2 Messages Inbox Page

```tsx
// app/(dashboard)/messages/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ConversationList } from '@/components/shared/messaging/ConversationList';

export default async function MessagesPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get user's conversations
  const { data: conversations } = await supabase
    .from('conversation_participants')
    .select(`
      conversation_id,
      conversation:conversations(
        id,
        title,
        conversation_type,
        last_message_at,
        last_message_preview,
        conversation_participants(
          user_id,
          user:users(id, email),
          player:players(id, first_name, last_name, avatar_url),
          coach:coaches(id, full_name, avatar_url, school_name)
        )
      )
    `)
    .eq('user_id', user.id)
    .order('conversation(last_message_at)', { ascending: false });

  // Get unread counts
  const { data: unreadCounts } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('read', false)
    .neq('sender_id', user.id);

  const unreadByConversation: Record<string, number> = {};
  unreadCounts?.forEach(msg => {
    unreadByConversation[msg.conversation_id] = (unreadByConversation[msg.conversation_id] || 0) + 1;
  });

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Messages</h1>
        </div>

        <ConversationList 
          conversations={conversations?.map(c => c.conversation) || []}
          unreadCounts={unreadByConversation}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}
```

### 2.3 Conversation List Component

```tsx
// components/shared/messaging/ConversationList.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Search, MessageSquare, Plus } from 'lucide-react';
import { NewConversationModal } from './NewConversationModal';

interface Participant {
  user_id: string;
  player: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  coach: { id: string; full_name: string; avatar_url: string | null; school_name: string } | null;
}

interface Conversation {
  id: string;
  title: string | null;
  conversation_type: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  conversation_participants: Participant[];
}

interface ConversationListProps {
  conversations: Conversation[];
  unreadCounts: Record<string, number>;
  currentUserId: string;
}

export function ConversationList({ 
  conversations, 
  unreadCounts, 
  currentUserId 
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const getOtherParticipant = (conversation: Conversation) => {
    const other = conversation.conversation_participants.find(p => p.user_id !== currentUserId);
    if (other?.player) {
      return {
        name: `${other.player.first_name} ${other.player.last_name}`,
        avatar: other.player.avatar_url,
        subtitle: 'Player',
      };
    }
    if (other?.coach) {
      return {
        name: other.coach.full_name,
        avatar: other.coach.avatar_url,
        subtitle: other.coach.school_name,
      };
    }
    return { name: 'Unknown', avatar: null, subtitle: '' };
  };

  const filteredConversations = conversations.filter(conv => {
    if (!search) return true;
    const other = getOtherParticipant(conv);
    return other.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 
                         focus:border-green-500 focus:ring-2 focus:ring-green-100
                         text-sm text-slate-900"
            />
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {/* Conversations */}
      {filteredConversations.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No conversations yet</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredConversations.map((conv) => {
            const other = getOtherParticipant(conv);
            const unread = unreadCounts[conv.id] || 0;

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors
                  ${unread > 0 ? 'bg-green-50/50' : ''}`}
              >
                {other.avatar ? (
                  <img 
                    src={other.avatar} 
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-slate-600">
                      {other.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`font-medium truncate ${unread > 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                      {conv.title || other.name}
                    </p>
                    {conv.last_message_at && (
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                        {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-sm truncate ${unread > 0 ? 'text-slate-600 font-medium' : 'text-slate-500'}`}>
                      {conv.last_message_preview || 'No messages yet'}
                    </p>
                    {unread > 0 && (
                      <span className="flex-shrink-0 ml-2 w-5 h-5 rounded-full bg-green-600 
                                       text-white text-xs font-medium flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <NewConversationModal 
          onClose={() => setShowNewModal(false)}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
```

### 2.4 Conversation View Page

```tsx
// app/(dashboard)/messages/[conversationId]/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ConversationView } from '@/components/shared/messaging/ConversationView';

export default async function ConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify user is participant
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', params.conversationId)
    .eq('user_id', user.id)
    .single();

  if (!participant) notFound();

  // Get conversation with messages
  const { data: conversation } = await supabase
    .from('conversations')
    .select(`
      *,
      conversation_participants(
        user_id,
        player:players(id, first_name, last_name, avatar_url),
        coach:coaches(id, full_name, avatar_url, school_name)
      ),
      messages(
        id,
        sender_id,
        content,
        created_at,
        read,
        message_type,
        attachments
      )
    `)
    .eq('id', params.conversationId)
    .order('messages(created_at)', { ascending: true })
    .single();

  if (!conversation) notFound();

  // Mark messages as read
  await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', params.conversationId)
    .neq('sender_id', user.id);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <ConversationView 
        conversation={conversation}
        currentUserId={user.id}
      />
    </div>
  );
}
```

### 2.5 Conversation View Component

```tsx
// components/shared/messaging/ConversationView.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Send, Paperclip, MoreHorizontal } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { sendMessage } from '@/app/actions/messaging';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read: boolean;
  message_type: string;
  attachments: any;
}

interface Participant {
  user_id: string;
  player: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
  coach: { id: string; full_name: string; avatar_url: string | null; school_name: string } | null;
}

interface Conversation {
  id: string;
  title: string | null;
  conversation_participants: Participant[];
  messages: Message[];
}

interface ConversationViewProps {
  conversation: Conversation;
  currentUserId: string;
}

export function ConversationView({ conversation, currentUserId }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>(conversation.messages);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const otherParticipant = conversation.conversation_participants.find(
    p => p.user_id !== currentUserId
  );

  const otherName = otherParticipant?.player 
    ? `${otherParticipant.player.first_name} ${otherParticipant.player.last_name}`
    : otherParticipant?.coach?.full_name || 'Unknown';

  const otherAvatar = otherParticipant?.player?.avatar_url || otherParticipant?.coach?.avatar_url;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to real-time messages
  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase
      .channel(`conversation:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage({
        conversationId: conversation.id,
        senderId: currentUserId,
        content: newMessage.trim(),
      });
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
    setSending(false);
  };

  const participantMap: Record<string, { name: string; avatar: string | null }> = {};
  conversation.conversation_participants.forEach(p => {
    if (p.player) {
      participantMap[p.user_id] = {
        name: `${p.player.first_name} ${p.player.last_name}`,
        avatar: p.player.avatar_url,
      };
    } else if (p.coach) {
      participantMap[p.user_id] = {
        name: p.coach.full_name,
        avatar: p.coach.avatar_url,
      };
    }
  });

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/messages"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          
          {otherAvatar ? (
            <img 
              src={otherAvatar} 
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <span className="text-sm font-medium text-slate-600">
                {otherName.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
          )}

          <div className="flex-1">
            <p className="font-medium text-slate-900">{otherName}</p>
            {otherParticipant?.coach?.school_name && (
              <p className="text-sm text-slate-500">{otherParticipant.coach.school_name}</p>
            )}
          </div>

          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message, index) => {
          const isOwn = message.sender_id === currentUserId;
          const sender = participantMap[message.sender_id];
          const showDate = index === 0 || 
            new Date(messages[index - 1].created_at).toDateString() !== 
            new Date(message.created_at).toDateString();

          return (
            <div key={message.id}>
              {showDate && (
                <div className="text-center my-4">
                  <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    {format(new Date(message.created_at), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
              <MessageBubble
                message={message}
                isOwn={isOwn}
                senderName={sender?.name || 'Unknown'}
                senderAvatar={sender?.avatar || null}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 
                       focus:border-green-500 focus:ring-2 focus:ring-green-100
                       text-slate-900 placeholder:text-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="p-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg 
                       transition-colors disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 2.6 Message Bubble Component

```tsx
// components/shared/messaging/MessageBubble.tsx
import { format } from 'date-fns';

interface Message {
  id: string;
  content: string;
  created_at: string;
  message_type: string;
  attachments: any;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  senderName: string;
  senderAvatar: string | null;
}

export function MessageBubble({ message, isOwn, senderName, senderAvatar }: MessageBubbleProps) {
  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        senderAvatar ? (
          <img 
            src={senderAvatar} 
            alt=""
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-slate-600">
              {senderName.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
        )
      )}

      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isOwn 
              ? 'bg-green-600 text-white rounded-tr-sm' 
              : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <p className={`text-xs text-slate-400 mt-1 ${isOwn ? 'text-right' : ''}`}>
          {format(new Date(message.created_at), 'h:mm a')}
        </p>
      </div>
    </div>
  );
}
```

---

## 3. Notifications System

### 3.1 Notification Bell Component

```tsx
// components/shared/notifications/NotificationBell.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';
import { createClient } from '@/lib/supabase/client';

interface NotificationBellProps {
  userId: string;
  initialUnreadCount: number;
}

export function NotificationBell({ userId, initialUnreadCount }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Subscribe to real-time notifications
  useEffect(() => {
    const supabase = createClient();
    
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs 
                           font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown 
          userId={userId}
          onClose={() => setIsOpen(false)}
          onMarkAllRead={() => setUnreadCount(0)}
        />
      )}
    </div>
  );
}
```

### 3.2 Notification Dropdown Component

```tsx
// components/shared/notifications/NotificationDropdown.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Check, Eye, Heart, MessageSquare, Tent, Bell } from 'lucide-react';
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications';

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  action_url: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationDropdownProps {
  userId: string;
  onClose: () => void;
  onMarkAllRead: () => void;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string }> = {
  profile_view: { icon: Eye, color: 'bg-blue-100 text-blue-600' },
  watchlist_add: { icon: Heart, color: 'bg-pink-100 text-pink-600' },
  message: { icon: MessageSquare, color: 'bg-green-100 text-green-600' },
  camp_interest: { icon: Tent, color: 'bg-amber-100 text-amber-600' },
  default: { icon: Bell, color: 'bg-slate-100 text-slate-600' },
};

export function NotificationDropdown({ userId, onClose, onMarkAllRead }: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    const response = await fetch(`/api/notifications?limit=10`);
    const data = await response.json();
    setNotifications(data.notifications || []);
    setLoading(false);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    onMarkAllRead();
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markNotificationRead(notification.id);
    }
    onClose();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-lg z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const config = TYPE_CONFIG[notification.notification_type] || TYPE_CONFIG.default;
              const Icon = config.icon;

              const content = (
                <div className={`flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors
                  ${!notification.read ? 'bg-green-50/50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                      {notification.title}
                    </p>
                    <p className="text-sm text-slate-500 truncate">{notification.message}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                  )}
                </div>
              );

              return notification.action_url ? (
                <Link
                  key={notification.id}
                  href={notification.action_url}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {content}
                </Link>
              ) : (
                <div key={notification.id} onClick={() => handleNotificationClick(notification)}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-sm text-green-600 hover:text-green-700 font-medium"
        >
          View all notifications →
        </Link>
      </div>
    </div>
  );
}
```

---

## 5. Public Profiles

### 5.1 Public Player Profile Page

```tsx
// app/player/[id]/page.tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PublicPlayerProfile } from '@/components/shared/profiles/PublicPlayerProfile';

export default async function PublicPlayerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  // Get player (only if recruiting activated)
  const { data: player } = await supabase
    .from('players')
    .select(`
      *,
      player_videos(id, title, thumbnail_url, video_url, video_type, is_primary, view_count),
      player_metrics(metric_label, metric_value, metric_type),
      player_achievements(title, description, achievement_date)
    `)
    .eq('id', params.id)
    .eq('recruiting_activated', true)
    .single();

  if (!player) notFound();

  // Record profile view if there's a logged-in coach viewing
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      await supabase.from('player_engagement_events').insert({
        player_id: player.id,
        coach_id: coach.id,
        engagement_type: 'profile_view',
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <PublicPlayerProfile player={player} />
    </div>
  );
}
```

### 5.2 Public Player Profile Component

```tsx
// components/shared/profiles/PublicPlayerProfile.tsx
import { MapPin, GraduationCap, Ruler, Scale, Play } from 'lucide-react';

interface Video {
  id: string;
  title: string;
  thumbnail_url: string | null;
  video_url: string;
  video_type: string;
  is_primary: boolean;
  view_count: number;
}

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string;
  secondary_position: string | null;
  grad_year: number;
  city: string | null;
  state: string | null;
  high_school_name: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  bats: string | null;
  throws: string | null;
  pitch_velo: number | null;
  exit_velo: number | null;
  sixty_time: number | null;
  gpa: number | null;
  about_me: string | null;
  player_videos: Video[];
  player_metrics: any[];
  player_achievements: any[];
}

interface PublicPlayerProfileProps {
  player: Player;
}

export function PublicPlayerProfile({ player }: PublicPlayerProfileProps) {
  const height = player.height_feet && player.height_inches 
    ? `${player.height_feet}'${player.height_inches}"` 
    : null;

  const primaryVideo = player.player_videos.find(v => v.is_primary);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {player.avatar_url ? (
              <img 
                src={player.avatar_url} 
                alt={`${player.first_name} ${player.last_name}`}
                className="w-32 h-32 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-32 h-32 rounded-2xl bg-green-100 flex items-center justify-center">
                <span className="text-4xl font-bold text-green-700">
                  {player.first_name?.[0]}{player.last_name?.[0]}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">
              {player.first_name} {player.last_name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 mt-3">
              <span className="px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-lg">
                {player.primary_position}
                {player.secondary_position && `/${player.secondary_position}`}
              </span>
              
              <span className="flex items-center gap-1 text-slate-600">
                <GraduationCap className="w-4 h-4" />
                Class of {player.grad_year}
              </span>

              {(player.city || player.state) && (
                <span className="flex items-center gap-1 text-slate-600">
                  <MapPin className="w-4 h-4" />
                  {[player.city, player.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>

            {player.high_school_name && (
              <p className="text-slate-500 mt-2">{player.high_school_name}</p>
            )}

            {/* Physical */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              {height && (
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Ruler className="w-4 h-4" />
                  {height}
                </span>
              )}
              {player.weight_lbs && (
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Scale className="w-4 h-4" />
                  {player.weight_lbs} lbs
                </span>
              )}
              {player.bats && (
                <span className="text-sm text-slate-600">
                  Bats: {player.bats === 'S' ? 'Switch' : player.bats}
                </span>
              )}
              {player.throws && (
                <span className="text-sm text-slate-600">
                  Throws: {player.throws}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Primary Video */}
          {primaryVideo && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Highlight Video</h2>
              </div>
              <div className="aspect-video bg-black">
                <video 
                  src={primaryVideo.video_url} 
                  controls 
                  poster={primaryVideo.thumbnail_url || undefined}
                  className="w-full h-full"
                />
              </div>
            </div>
          )}

          {/* About */}
          {player.about_me && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">About</h2>
              <p className="text-slate-600 whitespace-pre-wrap">{player.about_me}</p>
            </div>
          )}

          {/* More Videos */}
          {player.player_videos.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">More Videos</h2>
              <div className="grid grid-cols-2 gap-4">
                {player.player_videos
                  .filter(v => !v.is_primary)
                  .slice(0, 4)
                  .map(video => (
                    <div key={video.id} className="aspect-video bg-slate-100 rounded-lg overflow-hidden relative group">
                      {video.thumbnail_url ? (
                        <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Play className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 
                                      flex items-center justify-center transition-opacity">
                        <Play className="w-12 h-12 text-white" fill="white" />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Key Metrics</h2>
            <div className="space-y-4">
              {player.pitch_velo && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Pitch Velocity</span>
                  <span className="text-xl font-semibold text-slate-900">{player.pitch_velo} mph</span>
                </div>
              )}
              {player.exit_velo && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Exit Velocity</span>
                  <span className="text-xl font-semibold text-slate-900">{player.exit_velo} mph</span>
                </div>
              )}
              {player.sixty_time && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">60-Yard Dash</span>
                  <span className="text-xl font-semibold text-slate-900">{player.sixty_time}s</span>
                </div>
              )}
            </div>
          </div>

          {/* Academics */}
          {player.gpa && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Academics</h2>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">GPA</span>
                <span className="text-xl font-semibold text-slate-900">{player.gpa}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 8. API Routes & Server Actions

### 8.1 Messaging Actions

```tsx
// app/actions/messaging.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createConversation(
  creatorUserId: string,
  participantUserIds: string[],
  title?: string
) {
  const supabase = await createClient();
  
  // Create conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      title,
      conversation_type: participantUserIds.length > 1 ? 'group' : 'direct',
      created_by: creatorUserId,
    })
    .select()
    .single();

  if (convError) throw new Error(convError.message);

  // Add participants
  const allUserIds = [creatorUserId, ...participantUserIds];
  const { error: partError } = await supabase
    .from('conversation_participants')
    .insert(
      allUserIds.map(userId => ({
        conversation_id: conversation.id,
        user_id: userId,
      }))
    );

  if (partError) throw new Error(partError.message);

  revalidatePath('/messages');
  return conversation;
}

export async function sendMessage({
  conversationId,
  senderId,
  content,
  messageType = 'text',
  attachments,
}: {
  conversationId: string;
  senderId: string;
  content: string;
  messageType?: string;
  attachments?: any;
}) {
  const supabase = await createClient();
  
  // Insert message
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      message_type: messageType,
      attachments,
    })
    .select()
    .single();

  if (msgError) throw new Error(msgError.message);

  // Update conversation last message
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.substring(0, 100),
    })
    .eq('id', conversationId);

  // Create notifications for other participants
  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', senderId);

  if (participants) {
    await supabase.from('notifications').insert(
      participants.map(p => ({
        user_id: p.user_id,
        notification_type: 'message',
        title: 'New message',
        message: content.substring(0, 50),
        action_url: `/messages/${conversationId}`,
      }))
    );
  }

  revalidatePath(`/messages/${conversationId}`);
  return message;
}
```

### 8.2 Notifications Actions

```tsx
// app/actions/notifications.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) throw new Error(error.message);

  revalidatePath('/notifications');
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  actionUrl,
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
}) {
  const supabase = await createClient();
  
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    notification_type: type,
    title,
    message,
    action_url: actionUrl,
  });

  if (error) throw new Error(error.message);
}
```

---

## Verification Checklist

### Messaging
- [ ] Conversation list loads
- [ ] New conversation creates correctly
- [ ] Messages send and appear
- [ ] Real-time updates work
- [ ] Unread counts display
- [ ] Mark as read works

### Notifications
- [ ] Bell shows unread count
- [ ] Dropdown loads notifications
- [ ] Mark all read works
- [ ] Real-time new notifications work
- [ ] Click navigates correctly

### Public Profiles
- [ ] Player profile loads (if recruiting activated)
- [ ] 404 for non-activated players
- [ ] Profile view recorded for coaches
- [ ] Videos display
- [ ] Metrics display

### Real-Time
- [ ] Supabase subscriptions work
- [ ] Messages update in real-time
- [ ] Notifications update in real-time

---

**Document End**

*This guide covers all shared systems used across user types. Real-time features use Supabase subscriptions for live updates.*
