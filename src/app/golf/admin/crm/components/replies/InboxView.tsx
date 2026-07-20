'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  IconMail,
  IconCheckCircle2,
} from '@/components/icons';
import { getInboxFeed, type CrmReply } from '@/app/golf/actions/crm-replies';
import { completeCrmTask } from '@/app/golf/actions/crm-foundations';
import type { CrmTask } from '@/app/golf/admin/crm/types/foundations';
import {
  INBOX_SECTIONS,
  SEGMENTED_TABLIST_CLASS,
  segmentedTabClass,
  segmentedTabIconClass,
  type InboxSectionId,
} from '@/app/golf/admin/crm/page-contracts';
import { ReplyThread } from './ReplyThread';
import { InboundLeadsView } from '../InboundLeadsView';
import { Button } from '@/components/ui/button';

// ============================================================================
// InboxView — everything INCOMING, in one destination:
//  · "Replies & tasks": three-column layout (replies left, tasks right,
//    selected thread/task center; stacks vertically on mobile)
//  · "Demo requests": landing-page demo_requests (InboundLeadsView), moved
//    here from the Outreach sub-tabs in the 2026-07-20 nav consolidation.
// ============================================================================

type Selection =
  | { kind: 'reply'; reply: CrmReply }
  | { kind: 'task'; task: CrmTask }
  | null;

function relTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export function InboxView() {
  const [section, setSection] = useState<InboxSectionId>('replies');
  const [replies, setReplies] = useState<CrmReply[]>([]);
  const [dueTasks, setDueTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const feed = await getInboxFeed({ limit: 100 });
      setReplies(feed.replies);
      setDueTasks(feed.dueTasks);
      // Auto-select the most recent unread reply, or the first reply, or first task.
      setSelection((current) => {
        if (current) return current;
        const firstUnread = feed.replies.find((r) => !r.is_read);
        if (firstUnread) return { kind: 'reply', reply: firstUnread };
        if (feed.replies.length > 0) return { kind: 'reply', reply: feed.replies[0]! };
        if (feed.dueTasks.length > 0) return { kind: 'task', task: feed.dueTasks[0]! };
        return null;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load inbox';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = useMemo(() => replies.filter((r) => !r.is_read).length, [replies]);

  const handleReplyRead = useCallback((updated: CrmReply) => {
    setReplies((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handleCompleteTask = async (task: CrmTask) => {
    try {
      const updated = await completeCrmTask(task.id);
      setDueTasks((prev) => prev.filter((t) => t.id !== updated.id));
      // If the completed task was selected, clear the selection.
      setSelection((cur) => (cur?.kind === 'task' && cur.task.id === task.id ? null : cur));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete task';
      setError(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-warm-900 flex items-center gap-2">
            <IconMail size={20} className="text-primary-600" />
            Inbox
          </h2>
          <p className="text-sm text-warm-500 mt-0.5">
            Everything incoming — replies, tasks due, and demo requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && section === 'replies' && (
            <span className="px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-xs font-semibold text-primary-700">
              {unreadCount} unread
            </span>
          )}
          <div
            role="tablist"
            aria-label="Inbox sections"
            className={SEGMENTED_TABLIST_CLASS}
          >
            {INBOX_SECTIONS.map((s) => {
              const isActive = section === s.id;
              const SectionIcon = s.Icon;
              return (
                <Button variant="ghost"
                  key={s.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSection(s.id)}
                  className={segmentedTabClass(isActive)}
                >
                  <SectionIcon size={15} className={segmentedTabIconClass(isActive)} aria-hidden />
                  {s.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {section === 'demos' && <InboundLeadsView />}

      {section === 'replies' && error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {section === 'replies' && (loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-96 rounded-2xl glass-standard border-warm-200/60 skeleton-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 min-h-[480px]">
          {/* Replies column */}
          <aside className="rounded-2xl glass-standard border-warm-200/60 overflow-hidden flex flex-col">
            <header className="px-4 py-3 border-b border-warm-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-600 flex items-center gap-1.5">
                <IconMail size={12} /> Replies
              </h3>
            </header>
            {replies.length === 0 ? (
              <p className="px-4 py-8 text-xs text-warm-500 text-center">
                No replies yet.
              </p>
            ) : (
              <ul className="divide-y divide-warm-100 overflow-y-auto flex-1">
                {replies.map((r) => {
                  const active =
                    selection?.kind === 'reply' && selection.reply.id === r.id;
                  return (
                    <li key={r.id}>
                      <Button variant="primary"
                        type="button"
                        onClick={() => setSelection({ kind: 'reply', reply: r })}
                        className={cn(
                          'w-full text-left px-4 py-3 transition-colors',
                          active
                            ? 'bg-primary-50/60'
                            : 'hover:bg-warm-50/60',
                        )}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {!r.is_read && (
                            <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                          )}
                          <span
                            className={cn(
                              'text-sm truncate',
                              r.is_read ? 'text-warm-700 font-medium' : 'font-semibold text-warm-900',
                            )}
                          >
                            {r.from_address}
                          </span>
                        </div>
                        {r.subject && (
                          <p className="text-xs text-warm-600 truncate">{r.subject}</p>
                        )}
                        <p className="text-eyebrow text-warm-500 mt-0.5">
                          {relTime(r.received_at)}
                        </p>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Detail column */}
          <section className="rounded-2xl glass-subtle border-warm-200/60 overflow-hidden flex flex-col">
            <header className="px-4 py-3 border-b border-warm-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-600">
                Detail
              </h3>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {!selection && (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <span className="inline-flex w-10 h-10 rounded-full bg-warm-100 items-center justify-center mb-2">
                      <IconMail size={18} className="text-warm-500" />
                    </span>
                    <p className="text-sm text-warm-600">Select an item to view details.</p>
                  </div>
                </div>
              )}
              {selection?.kind === 'reply' && (
                <ReplyThread reply={selection.reply} onRead={handleReplyRead} />
              )}
              {selection?.kind === 'task' && (
                <article className="rounded-xl border border-warm-200/60 glass-standard px-4 py-3">
                  <header className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-warm-900">
                        {selection.task.title}
                      </h4>
                      <p className="text-eyebrow text-warm-500 mt-0.5">
                        Due {relTime(selection.task.due_at)} · {selection.task.priority}
                      </p>
                    </div>
                    <Button variant="primary"
                      type="button"
                      onClick={() => handleCompleteTask(selection.task)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors"
                    >
                      <IconCheckCircle2 size={12} /> Complete
                    </Button>
                  </header>
                  {selection.task.description && (
                    <p className="text-sm text-warm-700 whitespace-pre-wrap mt-2">
                      {selection.task.description}
                    </p>
                  )}
                </article>
              )}
            </div>
          </section>

          {/* Tasks column */}
          <aside className="rounded-2xl glass-standard border-warm-200/60 overflow-hidden flex flex-col">
            <header className="px-4 py-3 border-b border-warm-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-600 flex items-center gap-1.5">
                <IconCheckCircle2 size={12} /> Due today
              </h3>
            </header>
            {dueTasks.length === 0 ? (
              <p className="px-4 py-8 text-xs text-warm-500 text-center">
                No tasks due today.
              </p>
            ) : (
              <ul className="divide-y divide-warm-100 overflow-y-auto flex-1">
                {dueTasks.map((t) => {
                  const active =
                    selection?.kind === 'task' && selection.task.id === t.id;
                  return (
                    <li key={t.id}>
                      <Button variant="primary"
                        type="button"
                        onClick={() => setSelection({ kind: 'task', task: t })}
                        className={cn(
                          'w-full text-left px-4 py-3 transition-colors',
                          active ? 'bg-primary-50/60' : 'hover:bg-warm-50/60',
                        )}
                      >
                        <p className="text-sm font-medium text-warm-900 truncate">
                          {t.title}
                        </p>
                        <p className="text-eyebrow text-warm-500 mt-0.5">
                          {t.due_at ? `Due ${relTime(t.due_at)}` : 'No due date'} · {t.priority}
                        </p>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      ))}
    </div>
  );
}
