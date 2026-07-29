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
import { CoachContextError } from '@/lib/coachhelm/v3/chat/context';
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { generalOpeners, coverageLine } from '@/lib/coachhelm/v3/chat/program-pulse';
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
    // Request-cached — the dashboard layout already resolved this exact context
    // for the CoachHelm drawer on this render. Same six serial round trips
    // otherwise. `getCoachChatContext` still throws CoachContextError, so the
    // redirect below is unchanged.
    ctx = await getCoachChatContext();
  } catch (err) {
    if (err instanceof CoachContextError) redirect('/golf/dashboard');
    throw err;
  }

  const { c: requestedId, q: pendingQuestion } = await searchParams;

  const [conversations, pulse] = await Promise.all([
    listConversations(sb),
    // Request-cached alongside the layout's drawer fetch. Already returns null
    // on failure: a pulse failure must not take the conversation surface down
    // with it — the coach can still ask questions without the suggestions.
    getCoachProgramPulse(),
  ]);

  const conversationId = requestedId ?? null;
  const history = conversationId ? await listMessages(sb, conversationId) : [];

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <AskSurface
        teamName={ctx.team_name}
        players={ctx.roster.map((p) => ({ id: p.id, name: p.name }))}
        // Only the GENERIC openers as pills. Each finding carries its own ask
        // on its own row, so `suggestionsFromPulse` — which mixes both — would
        // print half of them twice, once stripped of the evidence that makes
        // them worth asking.
        suggestions={pulse ? generalOpeners(pulse, ctx.team_name) : []}
        pulseItems={pulse?.items ?? []}
        coverage={pulse ? coverageLine(pulse) : null}
        asOfLabel={
          pulse
            ? new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: ctx.timezone,
              }).format(new Date(pulse.as_of))
            : null
        }
        conversations={conversations}
        conversationId={conversationId}
        initialMessages={restoreUIMessages(history)}
        pendingQuestion={pendingQuestion ?? null}
      />
    </div>
  );
}
