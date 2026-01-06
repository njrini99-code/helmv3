'use client';

import { motion } from 'framer-motion';
import { IconUsers, IconMail, IconCalendar, IconUser } from '@/components/icons';
import { PremiumGlassCard, SectionHeader } from '@/components/golf/dashboard';

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

export function TeamInfoPlayer({ team, coach, roster, announcements }: TeamInfoPlayerProps) {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-semibold text-warm-900">{team.name}</h1>
        <p className="text-warm-500 mt-1">Season: {team.season || 'Current'}</p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Coach Info */}
        {coach && (
          <motion.div variants={itemVariants}>
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
          </motion.div>
        )}

        {/* Announcements */}
        <motion.div variants={itemVariants}>
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
        </motion.div>

        {/* Roster */}
        <motion.div variants={itemVariants}>
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
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium">
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
        </motion.div>

        {/* Team Stats */}
        <motion.div variants={itemVariants}>
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
        </motion.div>
      </motion.div>
    </div>
  );
}
