/**
 * v3 coach chat — load one conversation's messages (W32-pt3).
 *
 * GET → { conversation, messages: ChatMessage[] } for the requested id.
 * RLS rejects cross-coach reads.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { getConversation, listMessages } from '@/lib/coachhelm/v3/chat/persistence';
import { describeError } from '@/lib/utils/describe-error';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return NextResponse.json({ error: 'Not a coach' }, { status: 403 });

    const conversation = await getConversation(supabase, id);
    if (!conversation || conversation.coach_id !== coach.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const messages = await listMessages(supabase, id);
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    await logServerError(
      `chat/conversations/[id] failed: ${describeError(err)}`,
      { action: 'v3.chat.conversation' },
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
