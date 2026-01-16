'use client';

import { motion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, getFullName } from '@/lib/utils';
import { IconX, IconMail, IconMapPin, IconSchool, IconCalendar, IconChevronRight } from '@/components/icons';
import type { Player, WatchlistWithPlayer, PipelineStage } from '@/lib/types';
import Link from 'next/link';

interface PlayerQuickViewProps {
  player: Player;
  watchlistItem?: WatchlistWithPlayer;
  onClose: () => void;
}

const STAGE_CONFIG: Record<PipelineStage, {
  label: string;
  variant: 'default' | 'primary' | 'warning' | 'success' | 'secondary' | 'info';
  color: string;
  glow: string;
}> = {
  watchlist: { label: 'Watching', variant: 'default', color: 'bg-warm-500', glow: 'shadow-warm-500/20' },
  high_priority: { label: 'High Priority', variant: 'warning', color: 'bg-amber-500', glow: 'shadow-amber-500/30' },
  offer_extended: { label: 'Offer Extended', variant: 'primary', color: 'bg-primary-500', glow: 'shadow-primary-500/30' },
  committed: { label: 'Committed', variant: 'success', color: 'bg-emerald-500', glow: 'shadow-emerald-500/40' },
  uninterested: { label: 'Not Interested', variant: 'secondary', color: 'bg-slate-400', glow: '' },
};

export function PlayerQuickView({ player, watchlistItem, onClose }: PlayerQuickViewProps) {
  const fullName = getFullName(player.first_name, player.last_name);
  const stage = watchlistItem?.pipeline_stage as PipelineStage | undefined;
  const stageConfig = stage ? STAGE_CONFIG[stage] : null;

  return (
    <>
      {/* Premium backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
        className="fixed inset-0 bg-warm-900/30 backdrop-blur-md z-40"
      />

      {/* Premium Slideout Panel */}
      <motion.div
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 35, stiffness: 350 }}
        className={cn(
          'fixed right-0 top-0 bottom-0 w-full max-w-md z-50',
          'bg-gradient-to-b from-white via-white to-warm-50/50',
          'backdrop-blur-2xl',
          'border-l border-warm-200/50',
          'shadow-2xl shadow-warm-900/10',
          'flex flex-col',
          'overflow-hidden'
        )}
      >
        {/* Ambient glow at top */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-primary-500/5 to-transparent pointer-events-none" />

        {/* Header with premium treatment */}
        <div className="relative">
          {/* Close Button */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            onClick={onClose}
            className={cn(
              'absolute top-4 right-4 z-10',
              'p-2.5 rounded-xl',
              'bg-white/80 backdrop-blur-sm',
              'border border-warm-200/50',
              'text-warm-400 hover:text-warm-600',
              'hover:bg-white hover:shadow-md',
              'transition-all duration-200'
            )}
          >
            <IconX size={18} />
          </motion.button>

          {/* Player Hero Section */}
          <div className="relative px-6 pt-8 pb-6">
            {/* Avatar with glow effect */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
              className="relative inline-block"
            >
              {/* Glow ring behind avatar */}
              {stageConfig && stage !== 'uninterested' && (
                <div className={cn(
                  'absolute inset-0 rounded-full blur-lg opacity-40',
                  stageConfig.color
                )} />
              )}
              <Avatar
                src={player.avatar_url}
                name={fullName}
                size="xl"
                className={cn(
                  'relative ring-4 ring-white shadow-xl',
                  stageConfig && 'ring-offset-2'
                )}
              />
              {/* Stage indicator dot */}
              {stageConfig && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 500 }}
                  className={cn(
                    'absolute -bottom-1 -right-1',
                    'w-5 h-5 rounded-full',
                    'ring-4 ring-white',
                    stageConfig.color
                  )}
                />
              )}
            </motion.div>

            {/* Name and Position */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-4"
            >
              <h2 className="text-2xl font-bold text-warm-900 tracking-tight">
                {fullName}
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-base font-semibold text-primary-600">
                  {player.primary_position}
                </span>
                {player.secondary_position && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-warm-300" />
                    <span className="text-sm text-warm-500">
                      {player.secondary_position}
                    </span>
                  </>
                )}
              </div>
            </motion.div>

            {/* Stage Badge */}
            {stageConfig && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-3"
              >
                <Badge
                  variant={stageConfig.variant}
                  className="px-3 py-1 text-xs font-semibold"
                >
                  {stageConfig.label}
                </Badge>
              </motion.div>
            )}
          </div>

          {/* Divider with gradient */}
          <div className="h-px bg-gradient-to-r from-transparent via-warm-200 to-transparent" />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Quick Stats Grid */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="grid grid-cols-3 gap-3"
          >
            <StatBox label="Class" value={player.grad_year?.toString() || '—'} />
            <StatBox label="Height" value={formatHeight(player.height_feet, player.height_inches)} />
            <StatBox label="Weight" value={player.weight_lbs ? `${player.weight_lbs}` : '—'} unit="lbs" />
          </motion.div>

          {/* Details Section */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            {/* School */}
            {player.high_school_name && (
              <DetailRow
                icon={<IconSchool size={16} />}
                label="School"
                value={player.high_school_name}
              />
            )}

            {/* Location */}
            {(player.city || player.state) && (
              <DetailRow
                icon={<IconMapPin size={16} />}
                label="Location"
                value={[player.city, player.state].filter(Boolean).join(', ')}
              />
            )}

            {/* Grad Year */}
            {player.grad_year && (
              <DetailRow
                icon={<IconCalendar size={16} />}
                label="Graduation"
                value={`Class of ${player.grad_year}`}
              />
            )}

            {/* Email */}
            {player.email && (
              <DetailRow
                icon={<IconMail size={16} />}
                label="Email"
                value={player.email}
                isLink
                href={`mailto:${player.email}`}
              />
            )}
          </motion.div>

          {/* Performance Metrics */}
          {(player.exit_velo || player.pitch_velo || player.sixty_time || player.gpa) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <SectionHeader title="Performance" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                {player.exit_velo && (
                  <MetricCard
                    label="Exit Velo"
                    value={player.exit_velo.toString()}
                    unit="mph"
                    color="primary"
                  />
                )}
                {player.pitch_velo && (
                  <MetricCard
                    label="Pitch Velo"
                    value={player.pitch_velo.toString()}
                    unit="mph"
                    color="primary"
                  />
                )}
                {player.sixty_time && (
                  <MetricCard
                    label="60-Yard"
                    value={player.sixty_time.toString()}
                    unit="sec"
                    color="amber"
                  />
                )}
                {player.gpa && (
                  <MetricCard
                    label="GPA"
                    value={player.gpa.toFixed(2)}
                    color="emerald"
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* Bats/Throws */}
          {(player.bats || player.throws) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <SectionHeader title="Profile" />
              <div className="flex items-center gap-6 mt-3">
                {player.bats && (
                  <ProfileItem
                    label="Bats"
                    value={player.bats === 'R' ? 'Right' : player.bats === 'L' ? 'Left' : 'Switch'}
                  />
                )}
                {player.throws && (
                  <ProfileItem
                    label="Throws"
                    value={player.throws === 'R' ? 'Right' : 'Left'}
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* Notes */}
          {watchlistItem?.notes && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <SectionHeader title="Your Notes" />
              <div className={cn(
                'mt-3 p-4 rounded-xl',
                'bg-warm-50/80',
                'border border-warm-200/50',
                'text-sm text-warm-700 leading-relaxed'
              )}>
                {watchlistItem.notes}
              </div>
            </motion.div>
          )}

          {/* Added date */}
          {watchlistItem?.added_at && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xs text-warm-400 text-center"
            >
              Added {new Date(watchlistItem.added_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </motion.p>
          )}
        </div>

        {/* Footer with CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={cn(
            'p-4 border-t border-warm-100',
            'bg-gradient-to-t from-warm-50/80 to-white/50',
            'backdrop-blur-sm'
          )}
        >
          <Link href={`/baseball/dashboard/players/${player.id}`} className="block">
            <Button
              variant="primary"
              className={cn(
                'w-full py-3 rounded-xl',
                'bg-gradient-to-r from-primary-600 to-primary-500',
                'hover:from-primary-700 hover:to-primary-600',
                'shadow-lg shadow-primary-500/25',
                'hover:shadow-xl hover:shadow-primary-500/30',
                'transition-all duration-300',
                'group'
              )}
            >
              <span className="flex items-center justify-center gap-2">
                View Full Profile
                <IconChevronRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    </>
  );
}

// Premium stat box component
function StatBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={cn(
      'relative p-3 rounded-xl text-center',
      'bg-gradient-to-br from-white to-warm-50/50',
      'border border-warm-200/40',
      'shadow-sm',
      // Inner highlight
      'before:absolute before:inset-0 before:rounded-xl',
      'before:bg-gradient-to-b before:from-white/60 before:to-transparent',
      'before:pointer-events-none'
    )}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-warm-400 mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-warm-900 tabular-nums">
        {value}
        {unit && <span className="text-xs font-medium text-warm-400 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

// Premium metric card
function MetricCard({
  label,
  value,
  unit,
  color = 'primary'
}: {
  label: string;
  value: string;
  unit?: string;
  color?: 'primary' | 'amber' | 'emerald';
}) {
  const colorClasses = {
    primary: 'from-primary-50/80 to-primary-100/50 border-primary-200/50 text-primary-700',
    amber: 'from-amber-50/80 to-amber-100/50 border-amber-200/50 text-amber-700',
    emerald: 'from-emerald-50/80 to-emerald-100/50 border-emerald-200/50 text-emerald-700',
  };

  return (
    <div className={cn(
      'relative p-3 rounded-xl',
      'bg-gradient-to-br',
      colorClasses[color],
      'border'
    )}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums">
        {value}
        {unit && <span className="text-xs font-medium opacity-60 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

// Section header
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-warm-500">
        {title}
      </h3>
      <div className="flex-1 h-px bg-gradient-to-r from-warm-200 to-transparent" />
    </div>
  );
}

// Detail row component
function DetailRow({
  icon,
  label,
  value,
  isLink,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLink?: boolean;
  href?: string;
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg',
      'hover:bg-warm-50/80',
      'transition-colors duration-200'
    )}>
      <span className="text-warm-400 flex-shrink-0">{icon}</span>
      <span className="text-xs font-medium text-warm-500 w-20 flex-shrink-0">{label}</span>
      {isLink && href ? (
        <a
          href={href}
          className={cn(
            'text-sm font-medium text-primary-600',
            'hover:text-primary-700 hover:underline',
            'truncate'
          )}
        >
          {value}
        </a>
      ) : (
        <span className="text-sm font-medium text-warm-700 truncate">{value}</span>
      )}
    </div>
  );
}

// Profile item (bats/throws)
function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-warm-400">{label}:</span>
      <span className={cn(
        'px-2.5 py-1 rounded-md',
        'bg-warm-100/70',
        'text-sm font-semibold text-warm-700'
      )}>
        {value}
      </span>
    </div>
  );
}

function formatHeight(feet?: number | null, inches?: number | null): string {
  if (!feet) return '—';
  const inchesStr = inches ? `${inches}"` : '0"';
  return `${feet}'${inchesStr}`;
}
