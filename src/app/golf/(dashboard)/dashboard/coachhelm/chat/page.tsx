/**
 * W32-pt3 — coach chat full-history page.
 *
 * Coach-only. Lists every conversation in the left rail; clicking one
 * loads its messages into the main pane. New chat starts via the
 * drawer launcher elsewhere on the dashboard.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { listConversations, listMessages } from '@/lib/coachhelm/v3/chat/persistence';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { fairwayScope } from '@/lib/redesign/flag';
import { AskWorkspace, InlineNotice, Button } from '@/components/fairway';
import Link from 'next/link';

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function ChatHistoryPage({ searchParams }: PageProps) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) {
    // Un-gated role gate (hit regardless of the redesign fork): a minimal
    // Fairway-styled equivalent of the legacy `FeatureUnavailable` — same
    // copy, same behavior.
    return (
      <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
        <div className="w-full max-w-md">
          <InlineNotice
            tone="info"
            title="Chat History"
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/golf/dashboard/messages">Open Messages</Link>
              </Button>
            }
          >
            Coach chat history is part of the coach toolkit. Players can chat directly with
            their coach from the Messages tab.
          </InlineNotice>
        </div>
      </div>
    );
  }

  const sb = await createClient();
  const conversations = await listConversations(sb);
  const { c: selectedId } = await searchParams;

  const initialId = selectedId ?? conversations[0]?.id ?? null;
  const initialMessages = initialId ? await listMessages(sb, initialId) : [];

  // The warm "Ask" two-pane inbox (CoachHelmShell active='ask'). The SSR
  // conversations + resolved ?c= thread + its messages are passed UNCHANGED;
  // sending goes through the shared useCoachChatSend → POST /chat/send (same
  // endpoint, same optimistic stub). Coach gate above stays.
  const countsRes = await getAlertCounts(session.coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <AskWorkspace
        conversations={conversations}
        initialConversationId={initialId}
        initialMessages={initialMessages}
        signalCount={signalCount}
      />
    </div>
  );
}
