'use client';

/**
 * ============================================================================
 * ConversationClient — Living-Annual thread surface for a single baseball
 * conversation (plan: docs/baseball/ui-migration-execution-plan.md §3.1
 * `messages/[id]` row).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY — does NOT share `MessagesFairway` (list page only) or
 * touch `src/components/messages/ChatWindow.tsx`. `useMessages(conversationId)`
 * / `useConversations()` + `sendMessage` + the auto-scroll `messagesEndRef`
 * are the SAME hooks/handlers the legacy page called — this only reskins the
 * shell, bubbles, empty state, and composer around them. The send path
 * (`handleSend` → `sendMessage`) is untouched.
 *
 * SECURITY (Production-Readiness Mission W0a): this route had NO server-side
 * auth check at all — the original comment said "no separate *Client.tsx" for
 * a presentation reason (not sharing MessagesFairway), which still holds; this
 * file split is ONLY to let `page.tsx` guard with getSessionProfile() before
 * rendering, matching the repo's standard thin-server-wrapper shape. `id` is
 * still read via `useParams()` here (works fine under a server parent).
 * ========================================================================== */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoading } from '@/components/ui/loading';
import { IconSend, IconChevronLeft } from '@/components/icons';
import { useMessages, useConversations } from '@/hooks/use-messages';
import { useAuth } from '@/hooks/use-auth';
import { getFullName, formatDateTime, cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  SectionMasthead,
  PaperCard,
  InkBadge,
  EmptyIssue,
  Reveal,
  pressableClass,
} from '@/components/baseball/living-annual';

const MESSAGES_HREF = '/baseball/dashboard/messages';

/** Back-to-inbox affordance — a bespoke tappable link (not a `<Button>`), so
 * it reaches for the Stage-0 `pressableClass` primitive rather than a
 * one-off hover/press treatment. */
function ThreadBackLink() {
  return (
    <Link
      href={MESSAGES_HREF}
      className={cn(
        'mb-3 inline-flex w-fit items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary',
        pressableClass({ ink: 'team' }),
      )}
    >
      <IconChevronLeft size={14} aria-hidden="true" />
      Messages
    </Link>
  );
}

export default function ConversationClient() {
  const params = useParams();
  const conversationId = params.id as string;
  const { user } = useAuth();
  const { conversations, loading: conversationsLoading } = useConversations();
  const { messages, loading, sendMessage } = useMessages(conversationId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const other = conversation?.other_user;
  const otherName = other?.coach?.full_name || getFullName(other?.player?.first_name, other?.player?.last_name) || 'Unknown';
  const otherSubtitle = other?.coach?.coach_type?.replace('_', ' ') || (other?.player ? `${other.player.primary_position} • ${other.player.grad_year}` : '');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    const success = await sendMessage(input.trim());
    if (success) setInput('');
    setSending(false);
  };

  if (loading) return <PageLoading />;

  // Honest not-found: only once BOTH the thread and the conversation list
  // have finished loading and this id still isn't a known conversation for
  // this user — never a permanently blank "Unknown" header standing in for a
  // broken/stale link.
  if (!conversation && !conversationsLoading) {
    return (
      // #481: same height budget as the loaded thread below — see that
      // comment for why all three terms are required.
      <div
        className={fairwayScope(
          'flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-var(--golf-mobile-bottom-nav-offset,0px)-var(--baseball-hub-subnav-offset,0px))] flex-col px-4 py-6 sm:px-6',
        )}
      >
        <ThreadBackLink />
        <div className="flex flex-1 items-center justify-center">
          <EmptyIssue variant="messages" className="max-w-md" />
        </div>
      </div>
    );
  }

  return (
    // #481 fix: byte-identical height budget to the sibling list page's
    // `MessagesFairway.SHELL` constant — the AppShell top bar (`4rem` fixed
    // on every breakpoint) + the notch inset + `--golf-mobile-bottom-nav-
    // offset` (FairwayBottomNav's own clearance, zeroing at `md`+ where the
    // bar doesn't render). Previously this was a bare `100dvh-4rem` with
    // NEITHER term — on notched phones this pane was short by the missing
    // safe-area-inset-top AND rendered its composer under the fixed bottom
    // nav, the same root cause as the list page's pre-fix bug (see
    // MessagesFairway.tsx's SHELL comment for the full box-model walkthrough).
    //
    // #481 mustFix (round 2): this route ALSO matches the coach "messages"
    // hub (`resolveActiveHub` prefix-matches
    // `/baseball/dashboard/messages/` against COACH_MESSAGES_TABS' href), so
    // BaseballFairwayShell mounts the same `<HubSubNav>` strip above this
    // pane for coaches that it mounts above the list page — subtracting
    // `--baseball-hub-subnav-offset` (the strip's own measured height,
    // published by hub-sub-nav.tsx; `0px` for players, who have no
    // 'messages' hub) closes the identical clipped-composer bug here.
    <div
      className={fairwayScope(
        'flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-var(--golf-mobile-bottom-nav-offset,0px)-var(--baseball-hub-subnav-offset,0px))] flex-col',
      )}
    >
      <div className="flex shrink-0 flex-col border-b border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4 sm:px-6 sm:py-5">
        <ThreadBackLink />
        <SectionMasthead eyebrow={otherSubtitle || undefined} title={otherName} ink="team" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4">
          {messages.map((msg, i) => {
            const isOwn = msg.sender_id === user?.id;
            return (
              <Reveal
                key={msg.id}
                staggerIndex={Math.min(i, 8)}
                className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
              >
                <div className={cn('flex max-w-[85%] flex-col gap-1.5 sm:max-w-md', isOwn ? 'items-end' : 'items-start')}>
                  {!isOwn && <Avatar name={otherName} size="sm" />}
                  <PaperCard
                    className={cn('px-4 py-2.5', isOwn && 'border-[color:var(--grade-plus)]/30')}
                  >
                    <p className="text-sm text-text-primary">{msg.content}</p>
                  </PaperCard>
                  <InkBadge
                    label={msg.created_at ? formatDateTime(msg.created_at) : ''}
                    tone={isOwn ? 'team' : 'neutral'}
                  />
                </div>
              </Reveal>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-5 lg:pb-4"
      >
        <PaperCard className="mx-auto flex max-w-[720px] items-center gap-2 p-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
            aria-label="Message"
            className="flex-1 rounded-fw-md bg-inset px-4 py-2.5 text-base text-text-primary placeholder:text-text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-grade-plus lg:text-sm"
          />
          <Button type="submit" disabled={!input.trim() || sending} aria-label="Send message">
            <IconSend size={18} aria-hidden="true" />
          </Button>
        </PaperCard>
      </form>
    </div>
  );
}
