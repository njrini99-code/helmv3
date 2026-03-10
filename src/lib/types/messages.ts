'use client';

import type { Conversation, Coach, Player } from '@/lib/types';

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

// Helper to extract participant details from conversation
export function getParticipantDetails(
  conversation: ConversationWithMeta,
  // currentUserId parameter reserved for filtering logic
  _currentUserId: string  
): ParticipantDetails | null {
  const otherUser = conversation.other_user;

  if (!otherUser) return null;

  // Check if they're a coach (note: existing type uses 'coach' not 'coaches')
  const coach = otherUser.coach || otherUser.coaches;
  if (coach) {
    return {
      id: otherUser.id,
      name: coach.full_name || 'Coach',
      avatar: coach.avatar_url ?? null,
      role: 'coach',
      subtitle: coach.coach_type?.replace('_', ' ') || undefined,
      isOnline: false,
    };
  }

  // Check if they're a player (note: existing type uses 'player' not 'players')
  const player = otherUser.player || otherUser.players;
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

