import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAskV2Enabled } from '@/lib/coachhelm/v3/chat/ask-flag';
import { cancelHeld, receiptFor } from '@/lib/coachhelm/v3/chat/undo-hold';

/** One held action, the coach's own: Undo (DELETE) and its receipt (GET). Another coach's key is a 404, as a missing one is. */
async function coachId(): Promise<{ sb: Awaited<ReturnType<typeof createClient>>; coach: string } | null> {
  if (!isAskV2Enabled()) return null;
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from('golf_coaches').select('id').eq('user_id', auth.user.id).maybeSingle();
  return data ? { sb, coach: data.id } : null;
}

const none = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const who = await coachId();
  if (!who) return none();
  const { key } = await params;
  const row = await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key });
  return row ? NextResponse.json(row) : none();
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const who = await coachId();
  if (!who) return none();
  const { key } = await params;
  const found = await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key });
  if (!found) return none();
  const res = await cancelHeld(who.sb, { coach_id: who.coach, idempotency_key: key });
  if (res === 'cancelled') return NextResponse.json({ status: 'cancelled' });
  if (res === 'late') return NextResponse.json({ status: 'late' }, { status: 409 });
  return NextResponse.json({ error: 'Could not undo' }, { status: 500 });
}
