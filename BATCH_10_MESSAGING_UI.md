# BATCH 10: Messaging UI (Complete Implementation)

## Overview
The messaging system enables communication between coaches and players. This batch implements the complete chat interface following the locked-in design decision: **Glass Messaging** style with modern chat bubbles.

**Prerequisite:** Batches 1-9 must be complete.

---

## TABLE OF CONTENTS
1. [Design Decisions](#design-decisions)
2. [Database Schema](#database-schema)
3. [Messaging Layout](#messaging-layout)
4. [Thread List](#thread-list)
5. [Chat View](#chat-view)
6. [Message Bubbles](#message-bubbles)
7. [Message Composer](#message-composer)
8. [Typing Indicator](#typing-indicator)
9. [Read Receipts](#read-receipts)
10. [File Attachments](#file-attachments)
11. [Search Messages](#search-messages)
12. [Real-time Updates](#real-time-updates)
13. [Mobile Considerations](#mobile-considerations)
14. [Files to Create](#files-to-create)
15. [Verification Checklist](#verification-checklist)

---

## DESIGN DECISIONS

| Property | Decision | Notes |
|----------|----------|-------|
| Container Style | **Glass Messaging** | Glass effect on panels |
| Thread List Background | `bg-white/60 backdrop-blur-sm` | Subtle glass |
| Chat Area Background | 4-stop cream gradient | Per design system |
| Sent Bubble | `bg-primary-600 text-white` | Brand green |
| Received Bubble | `bg-white border border-warm-100` | White with border |
| Bubble Radius | `rounded-[18px]` | Rounded, chat-like |
| Timestamp | Small, subtle, grouped | Group by day |
| Avatar | Rounded square, 10px radius | Per design system |
| Input Area | Glass effect at bottom | Sticky input |

---

## DATABASE SCHEMA

```sql
-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  
  -- Conversation type
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  name TEXT, -- For group chats
  avatar_url TEXT, -- For group chats
  
  -- Participants (denormalized for quick access)
  participant_ids UUID[] NOT NULL,
  
  -- Last message preview
  last_message_id UUID,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  
  -- Content
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'system')),
  
  -- Attachments (JSONB array)
  attachments JSONB DEFAULT '[]',
  -- Format: [{ type: 'image'|'file', url: string, name: string, size: number, mime_type: string }]
  
  -- Reply to another message
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  -- Edit tracking
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGE READ STATUS TABLE
-- ============================================
CREATE TABLE message_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(message_id, user_id)
);

-- ============================================
-- CONVERSATION PARTICIPANTS TABLE
-- ============================================
CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Settings per user
  is_muted BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  
  -- Last read message for unread count
  last_read_message_id UUID REFERENCES messages(id),
  last_read_at TIMESTAMPTZ,
  
  -- Notifications
  notification_preference TEXT DEFAULT 'all' CHECK (notification_preference IN ('all', 'mentions', 'none')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(conversation_id, user_id)
);

-- ============================================
-- TYPING INDICATORS TABLE (for real-time)
-- ============================================
CREATE TABLE typing_indicators (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (conversation_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_read_status_user ON message_read_status(user_id);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_conversations_team ON conversations(team_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Users can only see conversations they're part of
CREATE POLICY "Users see own conversations" ON conversations
  FOR SELECT USING (auth.uid() = ANY(participant_ids));

-- Users can only see messages in their conversations
CREATE POLICY "Users see messages in their conversations" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE auth.uid() = ANY(participant_ids)
    )
  );

-- Users can send messages to conversations they're in
CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT id FROM conversations WHERE auth.uid() = ANY(participant_ids)
    )
  );

-- Users can manage their own read status
CREATE POLICY "Users manage own read status" ON message_read_status
  FOR ALL USING (user_id = auth.uid());

-- Users can see participants in their conversations
CREATE POLICY "Users see participants" ON conversation_participants
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE auth.uid() = ANY(participant_ids)
    )
  );

-- ============================================
-- FUNCTION: Update conversation on new message
-- ============================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_id = NEW.id,
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
```

---

## MESSAGING LAYOUT

### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Messages Header]                                                              │
│  Messages                                                    [New Message]      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │  [Thread List]       │  │  [Chat Area]                                   │  │
│  │                      │  │                                                │  │
│  │  ┌────────────────┐  │  │  ┌────────────────────────────────────────┐   │  │
│  │  │ 🔍 Search      │  │  │  │  [Chat Header]                         │   │  │
│  │  └────────────────┘  │  │  │  👤 John Smith           ● Online     │   │  │
│  │                      │  │  │                          [Call] [···]  │   │  │
│  │  ┌────────────────┐  │  │  └────────────────────────────────────────┘   │  │
│  │  │ [Thread Item]  │  │  │                                                │  │
│  │  │ 👤 John Smith  │  │  │  ┌────────────────────────────────────────┐   │  │
│  │  │ Hey, about the │  │  │  │        December 29, 2024              │   │  │
│  │  │ practice...    │  │  │  └────────────────────────────────────────┘   │  │
│  │  │      2m  ●     │  │  │                                                │  │
│  │  └────────────────┘  │  │                    ┌──────────────────────┐    │  │
│  │                      │  │                    │ Hey coach, I wanted  │    │  │
│  │  ┌────────────────┐  │  │                    │ to ask about the...  │    │  │
│  │  │ [Thread Item]  │  │  │                    │              10:30 AM │   │  │
│  │  │ 👤 Team Chat   │  │  │                    └──────────────────────┘    │  │
│  │  │ Coach: Great   │  │  │                                                │  │
│  │  │ game everyone! │  │  │  ┌──────────────────────┐                      │  │
│  │  │      1h        │  │  │  │ Of course! Let me    │                      │  │
│  │  └────────────────┘  │  │  │ explain the drill... │                      │  │
│  │                      │  │  │ 10:32 AM  ✓✓         │                      │  │
│  │  ┌────────────────┐  │  │  └──────────────────────┘                      │  │
│  │  │ [Thread Item]  │  │  │                                                │  │
│  │  │ 👤 Mike Jones  │  │  │                    ┌──────────────────────┐    │  │
│  │  │ Thanks for     │  │  │                    │ That makes sense!    │    │  │
│  │  │ the feedback   │  │  │                    │ Thanks coach 🙌      │    │  │
│  │  │      3h        │  │  │                    │              10:35 AM │   │  │
│  │  └────────────────┘  │  │                    └──────────────────────┘    │  │
│  │                      │  │                                                │  │
│  │                      │  │                    [John is typing...]         │  │
│  │                      │  │                                                │  │
│  │                      │  │  ┌────────────────────────────────────────┐   │  │
│  │                      │  │  │  [Composer]                            │   │  │
│  │                      │  │  │  📎  Type a message...        [Send]  │   │  │
│  │                      │  │  └────────────────────────────────────────┘   │  │
│  │                      │  │                                                │  │
│  └──────────────────────┘  └────────────────────────────────────────────────┘  │
│       320px                              Flex-1                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## THREAD LIST

### Component

```tsx
// src/components/messaging/thread-list.tsx

'use client'

import { useState, useMemo } from 'react'
import { SearchIcon, PlusIcon } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/types/messaging'

interface ThreadListProps {
  conversations: Conversation[]
  activeConversationId?: string
  onSelectConversation: (conversation: Conversation) => void
  onNewMessage: () => void
  isLoading?: boolean
  currentUserId: string
}

export function ThreadList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewMessage,
  isLoading = false,
  currentUserId,
}: ThreadListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  
  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations
    const query = searchQuery.toLowerCase()
    return conversations.filter(conv => {
      const name = getConversationName(conv, currentUserId).toLowerCase()
      const preview = conv.last_message_preview?.toLowerCase() || ''
      return name.includes(query) || preview.includes(query)
    })
  }, [conversations, searchQuery, currentUserId])
  
  // Get display name for conversation
  function getConversationName(conv: Conversation, userId: string): string {
    if (conv.type === 'group' && conv.name) return conv.name
    // For direct messages, show the other person's name
    const otherParticipant = conv.participants?.find(p => p.user_id !== userId)
    return otherParticipant 
      ? `${otherParticipant.first_name} ${otherParticipant.last_name}`
      : 'Unknown'
  }
  
  // Get avatar for conversation
  function getConversationAvatar(conv: Conversation, userId: string): string | null {
    if (conv.type === 'group' && conv.avatar_url) return conv.avatar_url
    const otherParticipant = conv.participants?.find(p => p.user_id !== userId)
    return otherParticipant?.avatar_url || null
  }

  return (
    <div className="
      w-[320px] flex-shrink-0
      flex flex-col
      bg-white/60 backdrop-blur-sm
      border-r border-warm-200
      h-full
    ">
      {/* Header */}
      <div className="p-4 border-b border-warm-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-warm-900">Messages</h2>
          <button
            onClick={onNewMessage}
            className="
              w-8 h-8 rounded-[10px]
              bg-primary-600 text-white
              flex items-center justify-center
              hover:bg-primary-700
              transition-colors duration-200
            "
            title="New message"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <SearchIcon className="
            absolute left-3 top-1/2 -translate-y-1/2
            w-4 h-4 text-warm-400
          " />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="
              w-full pl-9 pr-4 py-2
              bg-white/60 backdrop-blur-sm
              border border-white/30 rounded-[10px]
              text-sm text-warm-900
              placeholder:text-warm-400
              transition-all duration-200
              focus:outline-none focus:bg-white/80 focus:border-primary-300
            "
          />
        </div>
      </div>
      
      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          // Loading skeleton
          <div className="p-2 space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-12 h-12 rounded-[10px] bg-warm-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-warm-200 rounded w-3/4" />
                  <div className="h-3 bg-warm-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-warm-400">
              {searchQuery ? 'No conversations found' : 'No messages yet'}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {filteredConversations.map(conv => {
              const isActive = conv.id === activeConversationId
              const hasUnread = (conv.unread_count || 0) > 0
              const name = getConversationName(conv, currentUserId)
              const avatar = getConversationAvatar(conv, currentUserId)
              const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={cn(
                    "w-full flex items-center gap-3",
                    "p-3 rounded-[12px]",
                    "text-left",
                    "transition-all duration-200",
                    isActive
                      ? "bg-primary-50 border border-primary-200"
                      : "hover:bg-warm-50 border border-transparent"
                  )}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-[10px] overflow-hidden bg-warm-100">
                      {avatar ? (
                        <img src={avatar} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-warm-500 font-semibold">
                          {initials}
                        </div>
                      )}
                    </div>
                    {/* Online indicator */}
                    {conv.is_online && (
                      <div className="
                        absolute -bottom-0.5 -right-0.5
                        w-3.5 h-3.5 rounded-full
                        bg-primary-500 border-2 border-white
                      " />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "font-semibold text-sm truncate",
                        hasUnread ? "text-warm-900" : "text-warm-700"
                      )}>
                        {name}
                      </span>
                      <span className="text-xs text-warm-400 flex-shrink-0">
                        {conv.last_message_at 
                          ? formatDistanceToNowStrict(new Date(conv.last_message_at), { addSuffix: false })
                          : ''
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={cn(
                        "text-xs truncate flex-1",
                        hasUnread ? "text-warm-700 font-medium" : "text-warm-500"
                      )}>
                        {conv.last_message_preview || 'No messages yet'}
                      </p>
                      {hasUnread && (
                        <span className="
                          flex-shrink-0
                          w-5 h-5 rounded-full
                          bg-primary-600 text-white
                          text-[10px] font-bold
                          flex items-center justify-center
                        ">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## CHAT VIEW

### Component

```tsx
// src/components/messaging/chat-view.tsx

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  PhoneIcon, 
  VideoIcon, 
  MoreVerticalIcon,
  ArrowLeftIcon
} from 'lucide-react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { MessageBubble } from './message-bubble'
import { MessageComposer } from './message-composer'
import { TypingIndicator } from './typing-indicator'
import type { Conversation, Message } from '@/types/messaging'

interface ChatViewProps {
  conversation: Conversation
  messages: Message[]
  currentUserId: string
  typingUsers: { id: string; name: string }[]
  onSendMessage: (content: string, attachments?: File[]) => void
  onMarkAsRead: () => void
  onBack?: () => void // For mobile
  isLoading?: boolean
}

export function ChatView({
  conversation,
  messages,
  currentUserId,
  typingUsers,
  onSendMessage,
  onMarkAsRead,
  onBack,
  isLoading = false,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  // Get other participant for direct chats
  const otherParticipant = conversation.participants?.find(
    p => p.user_id !== currentUserId
  )
  
  const displayName = conversation.type === 'group' 
    ? conversation.name 
    : `${otherParticipant?.first_name} ${otherParticipant?.last_name}`
  
  const avatarUrl = conversation.type === 'group'
    ? conversation.avatar_url
    : otherParticipant?.avatar_url
  
  const initials = displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  
  // Scroll to bottom on new messages
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAtBottom])
  
  // Mark as read when viewing
  useEffect(() => {
    onMarkAsRead()
  }, [conversation.id, onMarkAsRead])
  
  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    const threshold = 100
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setIsAtBottom(distanceFromBottom < threshold)
  }, [])
  
  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = new Date(message.created_at)
    const dateKey = format(date, 'yyyy-MM-dd')
    
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(message)
    return groups
  }, {} as Record<string, Message[]>)
  
  // Format date header
  const formatDateHeader = (dateKey: string) => {
    const date = new Date(dateKey)
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'EEEE, MMMM d, yyyy')
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* ============================================ */}
      {/* CHAT HEADER */}
      {/* ============================================ */}
      <div className="
        flex items-center gap-3
        px-4 py-3
        bg-white/80 backdrop-blur-sm
        border-b border-warm-100
        flex-shrink-0
      ">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="
              w-8 h-8 rounded-[10px]
              flex items-center justify-center
              text-warm-500 hover:text-warm-700 hover:bg-warm-100
              transition-colors duration-200
              lg:hidden
            "
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        )}
        
        {/* Avatar */}
        <div className="w-10 h-10 rounded-[10px] overflow-hidden bg-warm-100 flex-shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-warm-500 font-semibold text-sm">
              {initials}
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-warm-900 truncate">{displayName}</h3>
          <p className="text-xs text-warm-500">
            {otherParticipant?.is_online ? (
              <span className="text-primary-600">● Online</span>
            ) : (
              otherParticipant?.last_seen_at 
                ? `Last seen ${formatDistanceToNowStrict(new Date(otherParticipant.last_seen_at))} ago`
                : 'Offline'
            )}
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          <button className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-colors duration-200
          ">
            <PhoneIcon className="w-5 h-5" />
          </button>
          <button className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-colors duration-200
          ">
            <VideoIcon className="w-5 h-5" />
          </button>
          <button className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-colors duration-200
          ">
            <MoreVerticalIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* ============================================ */}
      {/* MESSAGES AREA */}
      {/* ============================================ */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="
          flex-1 overflow-y-auto
          px-4 py-4
          bg-gradient-to-b from-cream via-[#FDF9F0] to-[#F5F0E6]
        "
      >
        {isLoading ? (
          // Loading skeleton
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div 
                key={i} 
                className={cn(
                  "flex",
                  i % 2 === 0 ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[70%] rounded-[18px] animate-pulse",
                  i % 2 === 0 ? "bg-primary-200" : "bg-warm-200"
                )} style={{ width: `${40 + Math.random() * 30}%`, height: '60px' }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {Object.entries(groupedMessages).map(([dateKey, dayMessages]) => (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="flex items-center justify-center my-4">
                  <span className="
                    px-3 py-1
                    bg-warm-100/80 backdrop-blur-sm
                    rounded-full
                    text-xs text-warm-500 font-medium
                  ">
                    {formatDateHeader(dateKey)}
                  </span>
                </div>
                
                {/* Messages for this day */}
                <div className="space-y-1">
                  {dayMessages.map((message, index) => {
                    const isSent = message.sender_id === currentUserId
                    const showAvatar = !isSent && (
                      index === 0 || 
                      dayMessages[index - 1]?.sender_id !== message.sender_id
                    )
                    const showTimestamp = 
                      index === dayMessages.length - 1 ||
                      dayMessages[index + 1]?.sender_id !== message.sender_id
                    
                    return (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isSent={isSent}
                        showAvatar={showAvatar}
                        showTimestamp={showTimestamp}
                        sender={conversation.participants?.find(p => p.user_id === message.sender_id)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <TypingIndicator users={typingUsers} />
            )}
            
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* ============================================ */}
      {/* MESSAGE COMPOSER */}
      {/* ============================================ */}
      <MessageComposer
        onSend={onSendMessage}
        conversationId={conversation.id}
      />
    </div>
  )
}
```

---

## MESSAGE BUBBLE

```tsx
// src/components/messaging/message-bubble.tsx

'use client'

import { format } from 'date-fns'
import { CheckIcon, CheckCheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message, Participant } from '@/types/messaging'

interface MessageBubbleProps {
  message: Message
  isSent: boolean
  showAvatar: boolean
  showTimestamp: boolean
  sender?: Participant
}

export function MessageBubble({
  message,
  isSent,
  showAvatar,
  showTimestamp,
  sender,
}: MessageBubbleProps) {
  const initials = sender 
    ? `${sender.first_name?.[0]}${sender.last_name?.[0]}`.toUpperCase()
    : '??'

  return (
    <div className={cn(
      "flex gap-2",
      isSent ? "justify-end" : "justify-start"
    )}>
      {/* Avatar (received messages only) */}
      {!isSent && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && (
            <div className="w-8 h-8 rounded-[8px] overflow-hidden bg-warm-100">
              {sender?.avatar_url ? (
                <img 
                  src={sender.avatar_url} 
                  alt={`${sender.first_name} ${sender.last_name}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-warm-500 text-xs font-semibold">
                  {initials}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Bubble */}
      <div className={cn(
        "max-w-[70%] min-w-[80px]",
        "flex flex-col",
        isSent ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "px-4 py-2.5 rounded-[18px]",
          isSent
            ? "bg-primary-600 text-white rounded-br-[4px]"
            : "bg-white border border-warm-100 text-warm-900 rounded-bl-[4px]"
        )}>
          {/* Message Content */}
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
          
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment, i) => (
                <AttachmentPreview 
                  key={i} 
                  attachment={attachment}
                  isSent={isSent}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Timestamp & Read Receipt */}
        {showTimestamp && (
          <div className={cn(
            "flex items-center gap-1 mt-1 px-1",
            isSent ? "flex-row-reverse" : "flex-row"
          )}>
            <span className="text-[10px] text-warm-400">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
            
            {/* Read receipt (sent messages only) */}
            {isSent && (
              <span className={cn(
                "text-[10px]",
                message.read_by_all ? "text-primary-500" : "text-warm-300"
              )}>
                {message.read_by_all ? (
                  <CheckCheckIcon className="w-3.5 h-3.5" />
                ) : (
                  <CheckIcon className="w-3.5 h-3.5" />
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Attachment preview component
function AttachmentPreview({ 
  attachment, 
  isSent 
}: { 
  attachment: { type: string; url: string; name: string; size?: number }
  isSent: boolean 
}) {
  if (attachment.type === 'image') {
    return (
      <img 
        src={attachment.url} 
        alt={attachment.name}
        className="max-w-[240px] rounded-[12px] cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => window.open(attachment.url, '_blank')}
      />
    )
  }
  
  return (
    <a 
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-[10px]",
        isSent ? "bg-white/20" : "bg-warm-50"
      )}
    >
      <span className="text-xs truncate max-w-[150px]">{attachment.name}</span>
      {attachment.size && (
        <span className="text-[10px] opacity-60">
          {formatFileSize(attachment.size)}
        </span>
      )}
    </a>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

---

## MESSAGE COMPOSER

```tsx
// src/components/messaging/message-composer.tsx

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  PaperclipIcon, 
  SendIcon, 
  SmileIcon,
  XIcon,
  ImageIcon,
  FileIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTypingIndicator } from '@/hooks/use-typing-indicator'

interface MessageComposerProps {
  onSend: (content: string, attachments?: File[]) => void
  conversationId: string
  placeholder?: string
  disabled?: boolean
}

export function MessageComposer({
  onSend,
  conversationId,
  placeholder = 'Type a message...',
  disabled = false,
}: MessageComposerProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Typing indicator
  const { startTyping, stopTyping } = useTypingIndicator(conversationId)
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px'
    }
  }, [message])
  
  // Handle input change with typing indicator
  const handleInputChange = (value: string) => {
    setMessage(value)
    if (value) {
      startTyping()
    } else {
      stopTyping()
    }
  }
  
  // Handle send
  const handleSend = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return
    
    onSend(message.trim(), attachments.length > 0 ? attachments : undefined)
    setMessage('')
    setAttachments([])
    stopTyping()
    
    // Focus textarea
    textareaRef.current?.focus()
  }, [message, attachments, onSend, stopTyping])
  
  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  // Handle file selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, 5 - attachments.length) // Max 5 files
    setAttachments(prev => [...prev, ...newFiles])
  }
  
  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }
  
  // Remove attachment
  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div 
      className={cn(
        "flex-shrink-0",
        "border-t border-warm-100",
        "bg-white/80 backdrop-blur-sm",
        "p-3"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Drop Zone Overlay */}
      {isDragging && (
        <div className="
          absolute inset-0
          bg-primary-50/90 backdrop-blur-sm
          border-2 border-dashed border-primary-400
          rounded-[12px]
          flex items-center justify-center
          z-10
        ">
          <p className="text-primary-600 font-medium">Drop files here</p>
        </div>
      )}
      
      {/* Attachment Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
          {attachments.map((file, index) => (
            <div 
              key={index}
              className="
                relative flex-shrink-0
                w-16 h-16 rounded-[10px]
                bg-warm-100 overflow-hidden
                group
              "
            >
              {file.type.startsWith('image/') ? (
                <img 
                  src={URL.createObjectURL(file)} 
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-1">
                  <FileIcon className="w-6 h-6 text-warm-400" />
                  <span className="text-[8px] text-warm-500 truncate w-full text-center mt-1">
                    {file.name}
                  </span>
                </div>
              )}
              
              {/* Remove button */}
              <button
                onClick={() => removeAttachment(index)}
                className="
                  absolute top-1 right-1
                  w-5 h-5 rounded-full
                  bg-warm-900/70 text-white
                  flex items-center justify-center
                  opacity-0 group-hover:opacity-100
                  transition-opacity duration-200
                "
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Input Area */}
      <div className="
        flex items-end gap-2
        bg-warm-50 rounded-[14px]
        p-2
      ">
        {/* Attachment Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachments.length >= 5}
          className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          title="Attach file"
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="
            flex-1
            bg-transparent
            text-sm text-warm-900
            placeholder:text-warm-400
            resize-none
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            max-h-[150px]
            py-2
          "
        />
        
        {/* Emoji Button */}
        <button
          className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            text-warm-400 hover:text-warm-600 hover:bg-warm-100
            transition-colors duration-200
          "
          title="Add emoji"
        >
          <SmileIcon className="w-5 h-5" />
        </button>
        
        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || (!message.trim() && attachments.length === 0)}
          className="
            w-9 h-9 rounded-[10px]
            flex items-center justify-center
            bg-primary-600 text-white
            hover:bg-primary-700
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          title="Send message"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
```

---

## TYPING INDICATOR

```tsx
// src/components/messaging/typing-indicator.tsx

import { cn } from '@/lib/utils'

interface TypingIndicatorProps {
  users: { id: string; name: string }[]
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null
  
  const text = users.length === 1
    ? `${users[0].name} is typing`
    : users.length === 2
    ? `${users[0].name} and ${users[1].name} are typing`
    : `${users[0].name} and ${users.length - 1} others are typing`

  return (
    <div className="flex items-center gap-2 py-2">
      {/* Animated dots */}
      <div className="flex items-center gap-1 px-3 py-2 bg-warm-100 rounded-[18px]">
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      
      {/* Text */}
      <span className="text-xs text-warm-400">{text}</span>
    </div>
  )
}
```

---

## REAL-TIME HOOKS

### Typing Indicator Hook

```tsx
// src/hooks/use-typing-indicator.ts

import { useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useTypingIndicator(conversationId: string) {
  const supabase = createClient()
  const timeoutRef = useRef<NodeJS.Timeout>()
  const isTypingRef = useRef(false)
  
  const startTyping = useCallback(async () => {
    if (isTypingRef.current) return
    isTypingRef.current = true
    
    // Upsert typing indicator
    await supabase
      .from('typing_indicators')
      .upsert({
        conversation_id: conversationId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        started_at: new Date().toISOString(),
      })
    
    // Clear after 3 seconds of no typing
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(stopTyping, 3000)
  }, [conversationId])
  
  const stopTyping = useCallback(async () => {
    if (!isTypingRef.current) return
    isTypingRef.current = false
    clearTimeout(timeoutRef.current)
    
    // Remove typing indicator
    await supabase
      .from('typing_indicators')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
  }, [conversationId])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
      stopTyping()
    }
  }, [stopTyping])
  
  return { startTyping, stopTyping }
}
```

### Messages Subscription Hook

```tsx
// src/hooks/use-messages-subscription.ts

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types/messaging'

export function useMessagesSubscription(
  conversationId: string,
  onNewMessage: (message: Message) => void
) {
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([])
  const supabase = createClient()
  
  useEffect(() => {
    // Subscribe to new messages
    const messagesChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          onNewMessage(payload.new as Message)
        }
      )
      .subscribe()
    
    // Subscribe to typing indicators
    const typingChannel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch current typing users
          const { data } = await supabase
            .from('typing_indicators')
            .select(`
              user_id,
              profiles:user_id (first_name, last_name)
            `)
            .eq('conversation_id', conversationId)
            .gt('started_at', new Date(Date.now() - 5000).toISOString())
          
          setTypingUsers(
            data?.map(t => ({
              id: t.user_id,
              name: `${t.profiles?.first_name} ${t.profiles?.last_name}`,
            })) || []
          )
        }
      )
      .subscribe()
    
    return () => {
      messagesChannel.unsubscribe()
      typingChannel.unsubscribe()
    }
  }, [conversationId, onNewMessage])
  
  return { typingUsers }
}
```

---

## FILES TO CREATE

### Types
1. `src/types/messaging.ts` - Message, Conversation, Participant types

### Components
2. `src/components/messaging/thread-list.tsx`
3. `src/components/messaging/chat-view.tsx`
4. `src/components/messaging/message-bubble.tsx`
5. `src/components/messaging/message-composer.tsx`
6. `src/components/messaging/typing-indicator.tsx`
7. `src/components/messaging/new-message-modal.tsx`
8. `src/components/messaging/message-search.tsx`
9. `src/components/messaging/conversation-settings.tsx`

### Pages
10. `src/app/(dashboard)/[sport]/(coach|player)/messages/page.tsx`
11. `src/app/(dashboard)/[sport]/(coach|player)/messages/[conversationId]/page.tsx`

### Hooks
12. `src/hooks/use-conversations.ts`
13. `src/hooks/use-messages.ts`
14. `src/hooks/use-messages-subscription.ts`
15. `src/hooks/use-typing-indicator.ts`

### API Routes
16. `src/app/api/messages/conversations/route.ts`
17. `src/app/api/messages/conversations/[id]/route.ts`
18. `src/app/api/messages/conversations/[id]/messages/route.ts`
19. `src/app/api/messages/conversations/[id]/read/route.ts`

---

## VERIFICATION CHECKLIST

### Thread List
- [ ] Uses glass effect: `bg-white/60 backdrop-blur-sm`
- [ ] Width is 320px fixed
- [ ] Search input uses glass style
- [ ] Active thread has primary-50 background
- [ ] Unread badge is circular, primary-600
- [ ] Online indicator is green dot on avatar
- [ ] Timestamps use relative format

### Chat View
- [ ] Header shows avatar, name, online status
- [ ] Messages area uses cream gradient background
- [ ] Date headers are centered, rounded pills
- [ ] Sent bubbles: `bg-primary-600 text-white rounded-[18px] rounded-br-[4px]`
- [ ] Received bubbles: `bg-white border border-warm-100 rounded-[18px] rounded-bl-[4px]`
- [ ] Avatar shows on first message in group from sender
- [ ] Read receipts: single check (sent) / double check (read)

### Composer
- [ ] Glass container: `bg-white/80 backdrop-blur-sm`
- [ ] Input area: `bg-warm-50 rounded-[14px]`
- [ ] Send button: `bg-primary-600` circular
- [ ] Attachment preview shows file thumbnails
- [ ] Enter sends (Shift+Enter for new line)
- [ ] Drag & drop file upload works

### Typing Indicator
- [ ] Uses bouncing dots animation
- [ ] Shows user name(s) typing
- [ ] Appears at bottom of message list

### Real-time
- [ ] New messages appear instantly
- [ ] Typing indicators update in real-time
- [ ] Read receipts update when message is read
- [ ] Conversation list updates on new messages

### Mobile
- [ ] Thread list becomes full-width drawer
- [ ] Back button appears in chat header
- [ ] Composer stays fixed at bottom
- [ ] Swipe gestures work (optional)

---

## NEXT STEPS
After Batch 10, consider implementing:
- **Batch 11: Search & Filters** - Discover page, filter panels
- **Batch 12: Onboarding & Empty States** - Setup wizard, completion widgets
- **Batch 13: Settings Pages** - Profile, team settings, preferences
