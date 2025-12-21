'use client';

import type { Message, Conversation, Coach, Player, User } from '@/lib/types';

// Message status for UI display
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

// Extended message with UI status
export interface UIMessage extends Message {
  status?: MessageStatus;
}

// Participant with user details
export interface ParticipantDetails {
  id: string;
  name: string;
  avatar: string | null;
  role: 'coach' | 'player';
  subtitle?: string;
  isOnline?: boolean;
}

// Other user data from conversation query (joined data)
export interface OtherUser {
  id: string;
  email?: string | null;
  coach?: Coach | null;
  coaches?: Coach | null;
  player?: Player | null;
  players?: Player | null;
}

// Last message preview
export interface LastMessage {
  content: string;
  sent_at: string | null;
  sender_id: string;
  read?: boolean;
}

// Extended conversation with joined data (from Supabase query)
export type ConversationWithMeta = Conversation & {
  unread_count?: number;
  other_user?: OtherUser | null;
  last_message?: LastMessage | null;
};

// Conversation with participant details added
export interface ConversationWithParticipant extends ConversationWithMeta {
  participant: ParticipantDetails | null;
}

// Helper to extract participant details from conversation
export function getParticipantDetails(
  conversation: ConversationWithMeta,
  currentUserId: string
): ParticipantDetails | null {
  const otherUser = conversation.other_user;

  if (!otherUser) return null;

  // Check if they're a coach (note: existing type uses 'coach' not 'coaches')
  const coach = (otherUser as any).coach || (otherUser as any).coaches;
  if (coach) {
    return {
      id: otherUser.id,
      name: coach.full_name || coach.school_name || 'Coach',
      avatar: coach.avatar_url,
      role: 'coach',
      subtitle: coach.school_name || coach.coach_title || undefined,
      isOnline: false,
    };
  }

  // Check if they're a player (note: existing type uses 'player' not 'players')
  const player = (otherUser as any).player || (otherUser as any).players;
  if (player) {
    const name = [player.first_name, player.last_name].filter(Boolean).join(' ');
    return {
      id: otherUser.id,
      name: name || 'Player',
      avatar: player.avatar_url,
      role: 'player',
      subtitle: player.grad_year ? `Class of ${player.grad_year}` : player.primary_position || undefined,
      isOnline: false,
    };
  }

  // Fallback
  return {
    id: otherUser.id,
    name: otherUser.email || 'Unknown',
    avatar: null,
    role: 'player',
  };
}

// Group messages by date
export function groupMessagesByDate(messages: UIMessage[]): Map<string, UIMessage[]> {
  const groups = new Map<string, UIMessage[]>();

  messages.forEach(message => {
    const date = message.sent_at ? new Date(message.sent_at) : new Date();
    const dateKey = formatDateKey(date);

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(message);
  });

  return groups;
}

// Format date for grouping
function formatDateKey(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (messageDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // Check if it's within this week
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (messageDate > weekAgo) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Otherwise show full date
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

// Format time for message
export function formatMessageTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
