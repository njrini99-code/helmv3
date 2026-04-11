'use client';

import { useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconClipboardList, IconBell, IconClock, IconCheck, IconAlertCircle } from '@/components/icons';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

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
            'relative overflow-clip',
            'glass-premium',
            'rounded-2xl'
        )}>
            {/* Tabs */}
            <div className="flex border-b border-white/15">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-all',
                                isActive
                                    ? 'text-primary-700 border-b-2 border-primary-600 bg-primary-50/30'
                                    : 'text-warm-500 hover:text-warm-700 hover:bg-white/30'
                            )}
                        >
                            <Icon size={13} />
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span className={cn(
                                    'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-micro font-bold tabular-nums',
                                    isActive ? 'bg-primary-600 text-white' : 'bg-warm-200 text-warm-600',
                                    tab.key === 'deadlines' && tab.count > 0 && 'bg-red-600 text-white'
                                )}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="p-1 min-h-[200px]">
                <AnimatePresence mode="wait">
                    <m.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-50 to-emerald-50 flex items-center justify-center mb-4">
                                    <IconCheck size={24} className="text-primary-600/80" />
                                </div>
                                <p className="text-[15px] font-semibold text-warm-900 tracking-tight mb-1">All caught up</p>
                                <p className="text-xs leading-relaxed text-warm-500">
                                    {activeTab === 'tasks' ? 'No pending tasks' :
                                     activeTab === 'announcements' ? 'No new announcements' :
                                     'No upcoming deadlines'}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/10">
                                {activeItems.slice(0, 6).map((item) => (
                                    <Link key={item.id} href={getItemLink(item, role)}>
                                        <div className={cn(
                                            'flex items-start gap-3 px-4 py-3 hover:bg-white/30 transition-colors cursor-pointer rounded-lg'
                                        )}>
                                            {/* Priority indicator */}
                                            <div className="flex-shrink-0 mt-0.5">
                                                {item.overdue ? (
                                                    <IconAlertCircle size={16} className="text-red-500" />
                                                ) : item.type === 'announcement' ? (
                                                    <IconBell size={16} className="text-blue-500" />
                                                ) : item.priority === 'high' || item.priority === 'urgent' ? (
                                                    <IconAlertCircle size={16} className="text-amber-500" />
                                                ) : (
                                                    <IconClipboardList size={16} className="text-warm-400" />
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    'text-sm font-medium truncate',
                                                    item.overdue ? 'text-red-700' : 'text-warm-900'
                                                )}>
                                                    {item.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-warm-400 tabular-nums" suppressHydrationWarning>
                                                        {now ? formatRelativeDate(item.date, now) : ''}
                                                    </span>
                                                    {item.overdue && (
                                                        <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                                            Overdue
                                                        </span>
                                                    )}
                                                    {(item.priority === 'high' || item.priority === 'urgent') && !item.overdue && (
                                                        <span className="text-micro font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
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
