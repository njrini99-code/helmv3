'use client';

import { m } from 'framer-motion';
import { IconUsers, IconMail, IconCalendar, IconUser, IconClipboardList } from '@/components/icons';
import { PremiumGlassCard, SectionHeader } from '@/components/golf/dashboard';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';

interface TeamInfoPlayerProps {
  team: {
    id: string;
    name: string;
    season: string | null;
    created_at: string | null;
  };
  coach: {
    full_name: string | null;
    avatar_url?: string | null;
  } | null;
  roster: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    handicap: number | null;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    content: string | null;
    created_at: string | null;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string | null;
    priority: string | null;
  }>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
  }
};

export function TeamInfoPlayer({ team, coach, roster, announcements, tasks = [] }: TeamInfoPlayerProps) {
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <m.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-warm-900 truncate">{team.name}</h1>
            <p className="text-warm-500 mt-1 text-sm md:text-base">Season: {team.season || 'Current'}</p>
          </div>
        </div>
      </m.div>

      <m.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Coach Info */}
        {coach && (
          <m.div variants={itemVariants}>
            <SectionHeader title="Head Coach" icon={<IconUser size={18} />} />
            <PremiumGlassCard className="mt-3">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-lg">
                  {coach.full_name?.charAt(0) || 'C'}
                </div>
                <div>
                  <p className="font-medium text-warm-900">{coach.full_name || 'Coach'}</p>
                  <p className="text-sm text-warm-500">Head Coach</p>
                </div>
              </div>
            </PremiumGlassCard>
          </m.div>
        )}

        {/* Announcements */}
        <m.div variants={itemVariants}>
          <SectionHeader
            title="Announcements"
            icon={<IconMail size={18} />}
            action={{ label: "View all", href: "/golf/dashboard/announcements" }}
          />
          <div className="mt-3 space-y-3">
            {announcements.length === 0 ? (
              <PremiumGlassCard>
                <p className="text-warm-500 text-sm text-center py-4">No announcements yet</p>
              </PremiumGlassCard>
            ) : (
              announcements.slice(0, 3).map((announcement) => (
                <PremiumGlassCard key={announcement.id}>
                  <h3 className="font-medium text-warm-900">{announcement.title}</h3>
                  <p className="text-sm text-warm-500 mt-1 line-clamp-2">{announcement.content || ''}</p>
                  <p className="text-xs text-warm-400 mt-2">
                    {announcement.created_at ? new Date(announcement.created_at).toLocaleDateString() : ''}
                  </p>
                </PremiumGlassCard>
              ))
            )}
          </div>
        </m.div>

        {/* Tasks */}
        <m.div variants={itemVariants}>
          <SectionHeader
            title="My Tasks"
            icon={<IconClipboardList size={18} />}
            action={{ label: "View all", href: "/golf/dashboard/tasks" }}
          />
          <div className="mt-3 space-y-2">
            {pendingTasks.length === 0 && completedTasks.length === 0 ? (
              <PremiumGlassCard>
                <p className="text-warm-500 text-sm text-center py-4">No tasks assigned yet</p>
              </PremiumGlassCard>
            ) : pendingTasks.length === 0 ? (
              <PremiumGlassCard>
                <div className="flex items-center gap-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <IconClipboardList size={16} className="text-primary-600" />
                  </div>
                  <p className="text-sm font-medium text-primary-700">All tasks completed!</p>
                </div>
              </PremiumGlassCard>
            ) : (
              pendingTasks.slice(0, 3).map((task) => (
                <PremiumGlassCard key={task.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-warm-900 text-sm">{task.title}</h3>
                      {task.description && (
                        <p className="text-xs text-warm-500 mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                      {task.due_date && (
                        <p className="text-xs text-warm-400 mt-1">
                          Due: {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                    {task.priority && task.priority !== 'normal' && (
                      <span className={`px-1.5 py-0.5 text-xs font-semibold rounded uppercase tracking-wider flex-shrink-0 ${
                        task.priority === 'high' || task.priority === 'urgent'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-warm-100 text-warm-500'
                      }`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                </PremiumGlassCard>
              ))
            )}
            {pendingTasks.length > 3 && (
              <p className="text-xs text-warm-400 text-center pt-1">
                +{pendingTasks.length - 3} more pending tasks
              </p>
            )}
          </div>
        </m.div>

        {/* Roster */}
        <m.div variants={itemVariants}>
          <SectionHeader
            title="Team Roster"
            icon={<IconUsers size={18} />}
            action={{ label: "View full roster", href: "/golf/dashboard/roster" }}
          />
          <PremiumGlassCard className="mt-3" noPadding>
            <div className="divide-y divide-white/20">
              {roster.length === 0 ? (
                <p className="text-warm-500 text-sm text-center py-6">No players on the roster yet</p>
              ) : (
                roster.slice(0, 5).map((player) => (
                  <div key={player.id} className="flex items-center gap-3 p-4">
                    <div className="w-10 h-10 rounded-full bg-warm-100 flex items-center justify-center text-warm-600 font-medium">
                      {(player.first_name || 'P').charAt(0)}{(player.last_name || '').charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-warm-900">
                        {player.first_name || 'Unknown'} {player.last_name || ''}
                      </p>
                      {player.handicap !== null && (
                        <p className="text-sm text-warm-500">Handicap: {player.handicap}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {roster.length > 5 && (
                <div className="p-3 text-center">
                  <p className="text-sm text-warm-500">+{roster.length - 5} more players</p>
                </div>
              )}
            </div>
          </PremiumGlassCard>
        </m.div>

        {/* Team Stats */}
        <m.div variants={itemVariants}>
          <SectionHeader title="Team Info" icon={<IconCalendar size={18} />} />
          <PremiumGlassCard className="mt-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-warm-500">Season</p>
                <p className="font-medium text-warm-900">{team.season || 'Current'}</p>
              </div>
              <div>
                <p className="text-sm text-warm-500">Roster Size</p>
                <p className="font-medium text-warm-900">{roster.length} players</p>
              </div>
              <div>
                <p className="text-sm text-warm-500">Established</p>
                <p className="font-medium text-warm-900">
                  {team.created_at ? new Date(team.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </PremiumGlassCard>
        </m.div>
      </m.div>
    </div>
  );
}
