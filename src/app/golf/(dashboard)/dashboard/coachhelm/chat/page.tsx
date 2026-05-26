/**
 * W32-pt3 — coach chat full-history page.
 *
 * Coach-only. Lists every conversation in the left rail; clicking one
 * loads its messages into the main pane. New chat starts via the
 * drawer launcher elsewhere on the dashboard.
 */

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { listConversations, listMessages } from '@/lib/coachhelm/v3/chat/persistence';
import { ChatHistoryClient } from './ChatHistoryClient';

interface PageProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function ChatHistoryPage({ searchParams }: PageProps) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) notFound();

  const sb = await createClient();
  const conversations = await listConversations(sb);
  const { c: selectedId } = await searchParams;

  const initialId = selectedId ?? conversations[0]?.id ?? null;
  const initialMessages = initialId ? await listMessages(sb, initialId) : [];

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.12em] text-warm-500">CoachHelm</p>
        <h1 className="text-2xl font-medium text-warm-900">Chat history</h1>
      </header>
      <ChatHistoryClient
        conversations={conversations}
        initialConversationId={initialId}
        initialMessages={initialMessages}
      />
    </div>
  );
}
