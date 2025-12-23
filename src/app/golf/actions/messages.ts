'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function sendGolfMessage(conversationId: string, content: string) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Verify user is a participant in this conversation
  const { data: participant } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (!participant) {
    throw new Error('Not a participant in this conversation');
  }

  // Insert message
  const { error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      sent_at: new Date().toISOString(),
      read: false,
    });

  if (messageError) {
    console.error('Message insert error:', messageError);
    throw new Error('Failed to send message');
  }

  // Update conversation updated_at
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  revalidatePath('/golf/dashboard/messages');

  return { success: true };
}

export async function createGolfConversation(participantUserIds: string[]) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Check if conversation already exists between these users
  if (participantUserIds.length === 1 && participantUserIds[0]) {
    // One-on-one conversation
    const otherUserId = participantUserIds[0];

    // Find existing conversation
    const { data: existingParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (existingParticipants) {
      for (const p of existingParticipants) {
        // Check if other user is also in this conversation
        const { data: otherInConv } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', p.conversation_id)
          .eq('user_id', otherUserId)
          .single();

        if (otherInConv) {
          // Found existing conversation
          return { conversationId: p.conversation_id };
        }
      }
    }
  }

  // Create new conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (convError || !conversation) {
    console.error('Conversation create error:', convError);
    throw new Error('Failed to create conversation');
  }

  // Add all participants (including creator)
  const allParticipants = [user.id, ...participantUserIds];
  const participants = allParticipants.map(userId => ({
    conversation_id: conversation.id,
    user_id: userId,
    last_read_at: new Date().toISOString(),
  }));

  const { error: participantsError } = await supabase
    .from('conversation_participants')
    .insert(participants);

  if (participantsError) {
    console.error('Participants insert error:', participantsError);
    throw new Error('Failed to add participants');
  }

  revalidatePath('/golf/dashboard/messages');

  return { conversationId: conversation.id };
}

export async function markGolfMessagesAsRead(conversationId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Update last_read_at for this participant
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  // Mark all messages in this conversation as read
  await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id);

  revalidatePath('/golf/dashboard/messages');

  return { success: true };
}
