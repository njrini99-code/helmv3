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
import { ChatHistoryClient } from './ChatHistoryClient';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { Reveal } from '@/components/ui/reveal';

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function ChatHistoryPage({ searchParams }: PageProps) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) {
    return (
      <FeatureUnavailable
        title="Chat History"
        message="Coach chat history is part of the coach toolkit. Players can chat directly with their coach from the Messages tab."
        actionHref="/golf/dashboard/messages"
        actionLabel="Open Messages"
      />
    );
  }

  const sb = await createClient();
  const conversations = await listConversations(sb);
  const { c: selectedId } = await searchParams;

  const initialId = selectedId ?? conversations[0]?.id ?? null;
  const initialMessages = initialId ? await listMessages(sb, initialId) : [];

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Chat history"
          backHref="/golf/dashboard/coachhelm"
          backLabel="CoachHelm"
        />
      </AnimatedItem>
      <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-10">
        <Reveal>
          <header className="mb-7">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-500 mb-1.5">
              CoachHelm
            </p>
            <h1 className="text-2xl md:text-3xl font-medium text-warm-900 tracking-tight">
              Chat history
            </h1>
            <p className="mt-2 text-sm text-warm-500">
              {conversations.length === 0
                ? 'No conversations yet — start one from any dashboard page.'
                : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
            </p>
          </header>
        </Reveal>
        <Reveal staggerIndex={1}>
          <ChatHistoryClient
            conversations={conversations}
            initialConversationId={initialId}
            initialMessages={initialMessages}
          />
        </Reveal>
      </div>
    </AnimatedPage>
  );
}
