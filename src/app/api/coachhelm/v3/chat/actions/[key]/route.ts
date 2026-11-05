import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAskV2Enabled } from '@/lib/coachhelm/v3/chat/ask-flag';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { heldCommitFor } from '@/lib/coachhelm/v3/chat/held-runner';
import { cancelHeld, commitHeldNow, receiptFor } from '@/lib/coachhelm/v3/chat/undo-hold';

/** A commit runs the write and its fan-out here, as the stream route's release does. */
export const maxDuration = 60;

/**
 * One held action, the coach's own: Undo (DELETE), Open (POST ?now=1) and its receipt (GET). Another coach's key is a 404, as a missing one is.
 * GET also finishes a row whose hold has ended: the client asks exactly when the ring ends, so a release that died in `after()` doesn't leave the card waiting.
 */
async function coachId(): Promise<{ sb: Awaited<ReturnType<typeof createClient>>; coach: string } | null> {
  if (!isAskV2Enabled()) return null;
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await sb.from('golf_coaches').select('id').eq('user_id', auth.user.id).maybeSingle();
  return data && !error ? { sb, coach: data.id } : null;
}

const none = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

type Who = NonNullable<Awaited<ReturnType<typeof coachId>>>;

async function commit(who: Who, key: string, due_only: boolean): Promise<void> {
  const ctx = await resolveCoachChatContext(who.sb).catch(() => null);
  if (!ctx || ctx.coach_id !== who.coach) return;
  await commitHeldNow(who.sb, { coach_id: who.coach, idempotency_key: key, due_only, resolve: (row) => heldCommitFor(who.sb, ctx, row) });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const who = await coachId();
  if (!who) return none();
  const { key } = await params;
  const row = await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key });
  if (!row) return none();
  if (row.status === 'held' && row.run_at && Date.parse(row.run_at) <= Date.now()) {
    await commit(who, key, true);
    return NextResponse.json((await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key })) ?? row);
  }
  return NextResponse.json(row);
}

/** Open: commits early, then the client navigates. `now=1` is required, so nothing posts its way past the hold by accident. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const who = await coachId();
  if (!who) return none();
  if (req.nextUrl.searchParams.get('now') !== '1') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { key } = await params;
  const found = await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key });
  if (!found) return none();
  if (found.status === 'held') await commit(who, key, false);
  const row = (await receiptFor(who.sb, { coach_id: who.coach, idempotency_key: key })) ?? found;
  return NextResponse.json(row, { status: row.status === 'cancelled' ? 409 : 200 });
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
