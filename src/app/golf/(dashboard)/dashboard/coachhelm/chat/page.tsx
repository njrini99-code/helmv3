/**
 * Ask CoachHelm — the full-page conversation.
 *
 * Coach-only. Server-resolves the roster (which becomes the composer's mention
 * source), the deterministic program pulse (which becomes the opening
 * suggestions), and any durable history for the requested thread.
 *
 * The suggestions are derived from the pulse rather than hardcoded on purpose:
 * offering "Compare two players on lag putting" to a program with four recorded
 * rounds advertises something the data cannot answer, and the first reply is a
 * disappointment.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { listConversations, listMessages } from '@/lib/coachhelm/v3/chat/persistence';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import { CoachContextError, resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { getProgramPulse, suggestionsFromPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import { fairwayScope } from '@/lib/redesign/flag';
import { InlineNotice, Button } from '@/components/fairway';
import { surfaceName } from '@/lib/golf/surface-registry';
import { AskSurface } from '@/components/golf/coachhelm/chat/AskSurface';

export const metadata: Metadata = {
  title: `${surfaceName('ask')} | CoachHelm`,
  description: 'Ask CoachHelm about your program — grounded in your recorded rounds and schedule.',
};

// The answers depend on data players change; never serve a cached shell.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ c?: string; q?: string }>;
}

export default async function AskCoachHelmPage({ searchParams }: PageProps) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  if (!session.coach) {
    return (
      <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
        <div className="w-full max-w-md">
          <InlineNotice
            tone="info"
            title="Ask CoachHelm"
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/golf/dashboard/coachhelm">Open CoachHelm</Link>
              </Button>
            }
          >
            Ask CoachHelm is part of the coach toolkit. Your own CoachHelm surface has your
            insights and development plan.
          </InlineNotice>
        </div>
      </div>
    );
  }

  const sb = await createClient();

  let ctx;
  try {
    ctx = await resolveCoachChatContext(sb);
  } catch (err) {
    if (err instanceof CoachContextError) redirect('/golf/dashboard');
    throw err;
  }

  const { c: requestedId, q: pendingQuestion } = await searchParams;

  const [conversations, pulse] = await Promise.all([
    listConversations(sb),
    // A pulse failure must not take the conversation surface down with it —
    // the coach can still ask questions without the suggestions.
    getProgramPulse(sb, ctx).catch(() => null),
  ]);

  const conversationId = requestedId ?? null;
  const history = conversationId ? await listMessages(sb, conversationId) : [];

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <AskSurface
        teamName={ctx.team_name}
        players={ctx.roster.map((p) => ({ id: p.id, name: p.name }))}
        suggestions={pulse ? suggestionsFromPulse(pulse, ctx.team_name) : []}
        conversations={conversations}
        conversationId={conversationId}
        initialMessages={restoreUIMessages(history)}
        pendingQuestion={pendingQuestion ?? null}
      />
    </div>
  );
}
