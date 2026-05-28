'use client';

import { useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconClipboardList, IconBell, IconClock, IconCheck, IconAlertCircle } from '@/components/icons';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';
import { Button } from '@/components/ui/button';

// ============================================================================
// HELPERS
// ============================================================================

function formatRelativeDate(dateStr: string, now: Date): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 0) {
        const futureDays = Math.abs(diffDays);
        if (futureDays === 0) return 'Today';
        if (futureDays === 1) return 'Tomorrow';
        if (futureDays < 7) return `In ${futureDays}d`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getItemLink(item: ActionItem, _role: 'coach' | 'player'): string {
    if (item.type === 'task' || item.type === 'deadline') return '/golf/dashboard/tasks';
    if (item.type === 'announcement') return '/golf/dashboard/announcements';
    return '/golf/dashboard';
}

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'tasks' | 'announcements' | 'deadlines';

interface ActionItemsCardProps {
    items: ActionItem[];
    role: 'coach' | 'player';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ActionItemsCard = memo(function ActionItemsCard({ items, role }: ActionItemsCardProps) {
  const prefersReducedMotion = useReducedMotion();
    const [activeTab, setActiveTab] = useState<TabKey>('tasks');

    // Defer time-dependent rendering to client to avoid hydration mismatch
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => { setNow(new Date()); }, []);

    const tasks = items.filter(i => i.type === 'task');
    const announcements = items.filter(i => i.type === 'announcement');
    const deadlines = items.filter(i => i.type === 'deadline' || i.overdue);

    const tabs: { key: TabKey; label: string; count: number; icon: typeof IconClipboardList }[] = [
        { key: 'tasks', label: 'Tasks', count: tasks.length, icon: IconClipboardList },
        { key: 'announcements', label: 'Updates', count: announcements.length, icon: IconBell },
        { key: 'deadlines', label: 'Due', count: deadlines.length, icon: IconClock },
    ];

    const activeItems = activeTab === 'tasks' ? tasks : activeTab === 'announcements' ? announcements : deadlines;

    return (
        <div className={cn(
            'relative overflow-clip surface-matte rounded-3xl'
        )}>
            <div className="flex">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <Button variant="ghost"
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'relative flex-1 flex items-center justify-center gap-1.5 px-3 py-4 text-body-sm font-medium transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                                isActive ? 'text-warm-900' : 'text-warm-500 hover:text-warm-700'
                            )}
                        >
                            <Icon size={13} />
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span className={cn(
                                    'inline-flex min-w-[16px] h-[16px] items-center justify-center px-1 rounded-full text-eyebrow font-medium tabular-nums',
                                    isActive ? 'bg-primary-100/90 text-primary-700' : 'bg-warm-100/80 text-warm-500',
                                    tab.key === 'deadlines' && tab.count > 0 && (isActive ? 'bg-red-100 text-red-700' : 'bg-red-50 text-red-600')
                                )}>
                                    {tab.count}
                                </span>
                            )}
                            {isActive && (
                                <m.span
                                    layoutId="action-tab-indicator"
                                    className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-primary-500/80"
                                    transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.45, ease: [0.16, 1, 0.3, 1] })}
                                />
                            )}
                        </Button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="min-h-[200px]">
                <AnimatePresence mode="wait">
                    <m.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.35, ease: [0.16, 1, 0.3, 1] })}
                    >
                        {activeItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-primary-50/65 flex items-center justify-center mb-4">
                                    <IconCheck size={22} className="text-primary-600/85" />
                                </div>
                                <p className="text-body font-medium tracking-[-0.005em] text-warm-900 mb-1.5">All caught up</p>
                                <p className="text-caption leading-relaxed text-warm-500">
                                    {activeTab === 'tasks' ? 'No pending tasks' :
                                     activeTab === 'announcements' ? 'No new announcements' :
                                     'No upcoming deadlines'}
                                </p>
                            </div>
                        ) : (
                            <div>
                                {activeItems.slice(0, 6).map((item) => (
                                    <Link key={item.id} href={getItemLink(item, role)}>
                                        <div className="group flex items-start gap-3 px-5 py-4 md:px-6 hover:bg-cream-50/55 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer">
                                            <div className="flex-shrink-0 mt-1">
                                                {item.overdue ? (
                                                    <IconAlertCircle size={15} className="text-red-500" />
                                                ) : item.type === 'announcement' ? (
                                                    <IconBell size={15} className="text-blue-500" />
                                                ) : item.priority === 'high' || item.priority === 'urgent' ? (
                                                    <IconAlertCircle size={15} className="text-amber-500" />
                                                ) : (
                                                    <IconClipboardList size={15} className="text-warm-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    'text-body-sm font-medium tracking-[-0.005em] truncate',
                                                    item.overdue ? 'text-red-700' : 'text-warm-900'
                                                )}>
                                                    {item.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-eyebrow text-warm-400 tabular-nums" suppressHydrationWarning>
                                                        {now ? formatRelativeDate(item.date, now) : ''}
                                                    </span>
                                                    {item.overdue && (
                                                        <span className="text-eyebrow font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                                                            Overdue
                                                        </span>
                                                    )}
                                                    {(item.priority === 'high' || item.priority === 'urgent') && !item.overdue && (
                                                        <span className="text-eyebrow font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                                            {item.priority === 'urgent' ? 'Urgent' : 'High'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </m.div>
                </AnimatePresence>
            </div>
        </div>
    );
});
