'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  IconPlus,
  IconTarget,
  IconUser,
  IconCheck,
  IconSend,
  IconWind,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconDumbbell,
  IconClipboardList,
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconEdit,
  IconTrash,
  IconChevronDown,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { createFocusArea, updateFocusArea, deleteFocusArea } from '@/app/golf/actions/development';

// ============================================================================
// TYPES
// ============================================================================

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  hometown: string | null;
  state: string | null;
}

interface FocusArea {
  id: string;
  player_id: string;
  coach_id: string | null;
  area_type: string;
  title: string;
  description: string | null;
  status: string | null;
  target_metric: string | null;
  current_value: number | null;
  target_value: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  player: Player | null;
}

interface PlayerStats {
  rounds_played: number;
  avg_score: number | null;
  avg_putts: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  best_score: number | null;
  recent_trend: 'improving' | 'declining' | 'stable' | null;
}

interface DevelopmentPlansClientProps {
  players: Player[];
  focusAreas: FocusArea[];
  coachId: string;
  playerStats: Record<string, PlayerStats>;
}

// ============================================================================
// AREA TYPE CONFIG (SVG icons, no emojis)
// ============================================================================

interface AreaTypeConfig {
  value: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  color: string;
  bgColor: string;
  suggestedMetrics: string[];
}

const AREA_TYPES: AreaTypeConfig[] = [
  {
    value: 'driving',
    label: 'Driving',
    icon: IconWind,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    suggestedMetrics: ['Driving Distance', 'Fairways Hit %', 'Fairway Accuracy'],
  },
  {
    value: 'iron_play',
    label: 'Iron Play',
    icon: IconCrosshair,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
    suggestedMetrics: ['GIR %', 'Proximity to Hole', 'Iron Accuracy'],
  },
  {
    value: 'short_game',
    label: 'Short Game',
    icon: IconFlag,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    suggestedMetrics: ['Scrambling %', 'Up & Down %', 'Sand Save %'],
  },
  {
    value: 'putting',
    label: 'Putting',
    icon: IconCircleDot,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    suggestedMetrics: ['Putts Per Round', '1-Putt %', '3-Putt Avoidance %'],
  },
  {
    value: 'course_management',
    label: 'Course Mgmt',
    icon: IconMap,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    suggestedMetrics: ['Scoring Average', 'Par 3 Avg', 'Par 5 Avg'],
  },
  {
    value: 'mental_game',
    label: 'Mental Game',
    icon: IconBrain,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    suggestedMetrics: ['Bounce Back %', 'Closing Holes Avg', 'Pressure Putts Made %'],
  },
  {
    value: 'fitness',
    label: 'Fitness',
    icon: IconDumbbell,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    suggestedMetrics: ['Workouts Per Week', 'Flexibility Score', 'Club Head Speed'],
  },
  {
    value: 'other',
    label: 'Other',
    icon: IconClipboardList,
    color: 'text-warm-600',
    bgColor: 'bg-warm-50',
    suggestedMetrics: ['Custom Metric'],
  },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-primary-50 text-primary-700 border-primary-200' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'completed', label: 'Completed', color: 'bg-warm-50 text-warm-600 border-warm-200' },
  { value: 'paused', label: 'Paused', color: 'bg-amber-50 text-amber-700 border-amber-200' },
];

function getAreaType(value: string): AreaTypeConfig {
  return AREA_TYPES.find(t => t.value === value) ?? AREA_TYPES[AREA_TYPES.length - 1]!;
}

function getStatusOption(value: string | null): (typeof STATUS_OPTIONS)[number] {
  return STATUS_OPTIONS.find(s => s.value === value) ?? STATUS_OPTIONS[0]!;
}

// ============================================================================
// PLAYER SNAPSHOT CARD (shown in create modal after selecting player)
// ============================================================================

function PlayerSnapshotCard({ player, stats, existingAreas }: {
  player: Player;
  stats: PlayerStats;
  existingAreas: FocusArea[];
}) {
  const activeAreas = existingAreas.filter(a => a.status === 'active' || a.status === 'in_progress');

  return (
    <div className="rounded-xl border border-warm-200/80 bg-cream-50/85 p-4">
      <div className="flex items-center gap-3 mb-3">
        {player.avatar_url ? (
          <Image
            src={player.avatar_url}
            alt={`${player.first_name} ${player.last_name}`}
            width={40}
            height={40}
            className="w-10 h-10 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary-600/90 flex items-center justify-center">
            <span className="text-white font-medium text-sm">
              {player.first_name?.[0]}{player.last_name?.[0]}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <p className="font-medium text-warm-900 text-sm">
            {player.first_name} {player.last_name}
          </p>
          <p className="text-xs text-warm-500">
            {player.graduation_year && `'${String(player.graduation_year).slice(-2)}`}
            {player.handicap != null && ` | ${player.handicap > 0 ? '+' : ''}${player.handicap} HCP`}
          </p>
        </div>
      </div>

      {stats.rounds_played > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-white border border-warm-100">
            <p className="text-xs text-warm-500">Avg Score</p>
            <p className="text-sm font-medium text-warm-900 tabular-nums">{stats.avg_score}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white border border-warm-100">
            <p className="text-xs text-warm-500">Avg Putts</p>
            <p className="text-sm font-medium text-warm-900 tabular-nums">{stats.avg_putts ?? '--'}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white border border-warm-100">
            <p className="text-xs text-warm-500">FW %</p>
            <p className="text-sm font-medium text-warm-900 tabular-nums">{stats.fairway_pct != null ? `${stats.fairway_pct}%` : '--'}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-white border border-warm-100">
            <p className="text-xs text-warm-500">GIR %</p>
            <p className="text-sm font-medium text-warm-900 tabular-nums">{stats.gir_pct != null ? `${stats.gir_pct}%` : '--'}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-warm-400 italic">No rounds recorded yet</p>
      )}

      {activeAreas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-warm-100">
          <p className="text-xs font-medium text-warm-500 mb-1.5">{activeAreas.length} active focus area{activeAreas.length !== 1 ? 's' : ''}</p>
          <div className="flex flex-wrap gap-1.5">
            {activeAreas.slice(0, 4).map(a => {
              const at = getAreaType(a.area_type);
              return (
                <span key={a.id} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', at.bgColor, at.color)}>
                  <at.icon size={10} />
                  {a.title.length > 20 ? a.title.slice(0, 20) + '...' : a.title}
                </span>
              );
            })}
            {activeAreas.length > 4 && (
              <span className="text-xs text-warm-400">+{activeAreas.length - 4} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DevelopmentPlansClient({
  players,
  focusAreas,
  coachId,
  playerStats,
}: DevelopmentPlansClientProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFocusArea, setEditingFocusArea] = useState<FocusArea | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    player_id: '',
    area_type: 'driving',
    title: '',
    description: '',
    target_metric: '',
    current_value: '',
    target_value: '',
  });

  // Helper — must be above summaryStats useMemo which calls it.
  // Using const arrow function means it's subject to TDZ if accessed
  // before this line, so it must come before any code that references it.
  const getProgressPercent = (current: number | null, target: number | null) => {
    if (!current || !target || target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  // Derived data
  const filteredFocusAreas = selectedPlayerId
    ? focusAreas.filter(fa => fa.player_id === selectedPlayerId)
    : focusAreas;

  const focusAreasByPlayer = useMemo(() =>
    players.map(player => ({
      player,
      areas: focusAreas.filter(fa => fa.player_id === player.id),
      stats: playerStats[player.id],
    })),
  [players, focusAreas, playerStats]);

  const summaryStats = useMemo(() => {
    const activeCount = focusAreas.filter(fa => fa.status === 'active' || fa.status === 'in_progress').length;
    const completedCount = focusAreas.filter(fa => fa.status === 'completed').length;
    const withProgress = focusAreas.filter(fa => fa.target_value && fa.current_value);
    const avgProgress = withProgress.length > 0
      ? Math.round(withProgress.reduce((sum, fa) => sum + getProgressPercent(fa.current_value, fa.target_value), 0) / withProgress.length)
      : 0;
    const playersWithAreas = new Set(focusAreas.filter(fa => fa.status !== 'completed').map(fa => fa.player_id)).size;
    return { activeCount, completedCount, avgProgress, total: focusAreas.length, playersWithAreas };
  }, [focusAreas]);

  // Selected player for create modal
  const selectedCreatePlayer = players.find(p => p.id === formData.player_id);
  const selectedCreateStats = formData.player_id ? playerStats[formData.player_id] : null;
  const selectedCreateAreas = formData.player_id ? focusAreas.filter(fa => fa.player_id === formData.player_id) : [];
  const currentAreaType = getAreaType(formData.area_type);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const resetForm = () => {
    setFormData({
      player_id: selectedPlayerId || '',
      area_type: 'driving',
      title: '',
      description: '',
      target_metric: '',
      current_value: '',
      target_value: '',
    });
  };

  const handleCreate = async () => {
    if (!formData.player_id || !formData.title) return;

    setIsSaving(true);
    try {
      await createFocusArea({
        player_id: formData.player_id,
        coach_id: coachId,
        area_type: formData.area_type,
        title: formData.title,
        description: formData.description || null,
        target_metric: formData.target_metric || null,
        current_value: formData.current_value ? parseFloat(formData.current_value) : null,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      });
      setIsCreateModalOpen(false);
      resetForm();
      router.refresh();
    } catch {
      // Error handled by server action
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (focusArea: FocusArea) => {
    setEditingFocusArea(focusArea);
    setFormData({
      player_id: focusArea.player_id,
      area_type: focusArea.area_type || 'driving',
      title: focusArea.title || '',
      description: focusArea.description || '',
      target_metric: focusArea.target_metric || '',
      current_value: focusArea.current_value?.toString() || '',
      target_value: focusArea.target_value?.toString() || '',
    });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingFocusArea || !formData.title) return;

    setIsSaving(true);
    try {
      await updateFocusArea(editingFocusArea.id, {
        area_type: formData.area_type,
        title: formData.title,
        description: formData.description || null,
        target_metric: formData.target_metric || null,
        current_value: formData.current_value ? parseFloat(formData.current_value) : null,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      });
      setIsEditModalOpen(false);
      setEditingFocusArea(null);
      resetForm();
      router.refresh();
    } catch {
      // Error handled by server action
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this focus area?')) return;
    try {
      await deleteFocusArea(id);
      router.refresh();
    } catch {
      // Error handled by server action
    }
  };

  const handleMarkComplete = async (focusArea: FocusArea) => {
    try {
      await updateFocusArea(focusArea.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
      router.refresh();
    } catch {
      // Error handled by server action
    }
  };

  // When player selection changes in create modal, auto-suggest metric based on area type
  const handleAreaTypeChange = (areaType: string) => {
    const at = getAreaType(areaType);
    const suggestedMetric = at.suggestedMetrics[0] || '';

    // Auto-populate current value from stats if available
    let autoCurrentValue = '';
    if (selectedCreateStats && selectedCreateStats.rounds_played > 0) {
      if (areaType === 'putting' && selectedCreateStats.avg_putts != null) {
        autoCurrentValue = String(selectedCreateStats.avg_putts);
      } else if (areaType === 'driving' && selectedCreateStats.fairway_pct != null) {
        autoCurrentValue = String(selectedCreateStats.fairway_pct);
      } else if (areaType === 'iron_play' && selectedCreateStats.gir_pct != null) {
        autoCurrentValue = String(selectedCreateStats.gir_pct);
      } else if (areaType === 'course_management' && selectedCreateStats.avg_score != null) {
        autoCurrentValue = String(selectedCreateStats.avg_score);
      }
    }

    setFormData(prev => ({
      ...prev,
      area_type: areaType,
      target_metric: suggestedMetric,
      current_value: autoCurrentValue,
    }));
  };

  // ============================================================================
  // RENDER: FOCUS AREA CARD
  // ============================================================================

  const renderFocusAreaCard = (fa: FocusArea, index: number, showPlayerName = false) => {
    const at = getAreaType(fa.area_type);
    const status = getStatusOption(fa.status);
    const pct = fa.target_value ? getProgressPercent(fa.current_value, fa.target_value) : null;
    const isExpanded = expandedCardId === fa.id;
    const isCompleted = fa.status === 'completed';

    return (
      <div
        key={fa.id}
        className={cn(
          'group relative rounded-2xl border transition-[background-color,border-color,box-shadow] duration-200',
          isCompleted
            ? 'bg-white/40 border-warm-200/60'
            : 'bg-cream-100/75 backdrop-blur-xl border-white/20 shadow-sm hover:shadow-md',
        )}
        style={{
          animation: 'fadeInUp 0.35s ease-out forwards',
          animationDelay: `${index * 40}ms`,
          opacity: 0,
        }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', at.bgColor)}>
                <at.icon size={18} className={at.color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={cn('font-medium text-warm-900 truncate', isCompleted && 'text-warm-500')}>{fa.title}</h3>
                  <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full border', status.color)}>
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-xs font-medium', at.color)}>{at.label}</span>
                  {showPlayerName && fa.player && (
                    <>
                      <span className="text-warm-300">|</span>
                      <span className="text-xs text-warm-500">{fa.player.first_name} {fa.player.last_name}</span>
                    </>
                  )}
                  {fa.started_at && (
                    <>
                      <span className="text-warm-300">|</span>
                      <span className="text-xs text-warm-400">
                        {new Date(fa.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setExpandedCardId(isExpanded ? null : fa.id)}
              className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
            >
              <IconChevronDown size={16} className={cn('transition-transform duration-200', isExpanded && 'rotate-180')} />
            </button>
          </div>

          {/* Progress bar */}
          {pct !== null && !isCompleted && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-warm-500 font-medium">{fa.target_metric || 'Progress'}</span>
                <span className="font-medium text-warm-700 tabular-nums">
                  {fa.current_value ?? 0} / {fa.target_value}
                  <span className={cn(
                    'ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium',
                    pct >= 100 ? 'bg-primary-100 text-primary-700'
                    : pct >= 75 ? 'bg-blue-50 text-blue-700'
                    : 'bg-warm-100 text-warm-600',
                  )}>
                    {pct}%
                  </span>
                </span>
              </div>
              <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700',
                    pct >= 100 ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                    : pct >= 75 ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                    : pct >= 50 ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                    : 'bg-gradient-to-r from-warm-400 to-warm-300',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-warm-100 space-y-3">
              {fa.description && (
                <p className="text-sm text-warm-600 leading-relaxed">{fa.description}</p>
              )}

              {fa.completed_at && (
                <p className="text-xs text-warm-400">
                  Completed {new Date(fa.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={() => handleEdit(fa)}>
                  <IconEdit size={13} className="mr-1.5" />
                  Edit
                </Button>
                {!isCompleted && (
                  <Button variant="secondary" size="sm" onClick={() => handleMarkComplete(fa)}>
                    <IconCheck size={13} className="mr-1.5" />
                    Complete
                  </Button>
                )}
                <button
                  onClick={() => handleDelete(fa.id)}
                  className="ml-auto p-2 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER: FORM MODAL CONTENT
  // ============================================================================

  const renderFormContent = (isEdit: boolean) => (
    <div className="space-y-5">
      {/* Player selection (create only) */}
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1.5">Player</label>
          <select
            value={formData.player_id}
            onChange={e => {
              const pid = e.target.value;
              setFormData(prev => ({ ...prev, player_id: pid }));
            }}
            className="w-full px-4 py-2.5 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 bg-white transition-colors"
          >
            <option value="">Select a player...</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
                {p.handicap != null ? ` (${p.handicap > 0 ? '+' : ''}${p.handicap} HCP)` : ''}
                {p.graduation_year ? ` - '${String(p.graduation_year).slice(-2)}` : ''}
              </option>
            ))}
          </select>

          {/* Player snapshot after selection */}
          {selectedCreatePlayer && selectedCreateStats && (
            <div className="mt-3">
              <PlayerSnapshotCard
                player={selectedCreatePlayer}
                stats={selectedCreateStats}
                existingAreas={selectedCreateAreas}
              />
            </div>
          )}
        </div>
      )}

      {/* Area type selector */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1.5">Focus Area</label>
        <div className="grid grid-cols-4 gap-2">
          {AREA_TYPES.map(type => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => handleAreaTypeChange(type.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-[background-color,border-color,box-shadow] duration-150',
                  formData.area_type === type.value
                    ? 'border-primary-500 bg-primary-50 shadow-sm'
                    : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50 active:bg-warm-100',
                )}
              >
                <Icon size={18} className={formData.area_type === type.value ? 'text-primary-600' : 'text-warm-400'} />
                <span className={cn(
                  'text-xs font-medium leading-tight text-center',
                  formData.area_type === type.value ? 'text-primary-700' : 'text-warm-600',
                )}>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1.5">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          placeholder={`e.g., Improve ${currentAreaType.label.toLowerCase()}...`}
          className="w-full px-4 py-2.5 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 placeholder:text-warm-400 transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1.5">
          Notes for player
          <span className="text-warm-400 font-normal ml-1">(optional)</span>
        </label>
        <textarea
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          placeholder="Describe the focus area, drills to work on, or specific goals..."
          className="w-full px-4 py-2.5 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 placeholder:text-warm-400 resize-none transition-colors"
        />
      </div>

      {/* Metric tracking */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1.5">
          Metric tracking
          <span className="text-warm-400 font-normal ml-1">(optional)</span>
        </label>
        <div className="space-y-3">
          {/* Metric name with suggestions */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              {currentAreaType.suggestedMetrics.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, target_metric: m }))}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                    formData.target_metric === m
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-100 text-warm-500 hover:bg-warm-200',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={formData.target_metric}
              onChange={e => setFormData({ ...formData, target_metric: e.target.value })}
              placeholder="Metric name"
              className="w-full px-4 py-2 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 text-sm placeholder:text-warm-400 transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-warm-500 mb-1">Current value</label>
              <input
                type="number"
                step="0.1"
                value={formData.current_value}
                onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                placeholder="e.g., 32"
                className="w-full px-4 py-2 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 text-sm placeholder:text-warm-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-warm-500 mb-1">Target value</label>
              <input
                type="number"
                step="0.1"
                value={formData.target_value}
                onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                placeholder="e.g., 28"
                className="w-full px-4 py-2 rounded-xl border border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-warm-900 text-sm placeholder:text-warm-400 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={() => {
            if (isEdit) {
              setIsEditModalOpen(false);
              setEditingFocusArea(null);
            } else {
              setIsCreateModalOpen(false);
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleUpdate : handleCreate}
          disabled={(!isEdit && !formData.player_id) || !formData.title || isSaving}
          isLoading={isSaving}
        >
          <IconSend size={14} className="mr-1.5" />
          {isEdit ? 'Save Changes' : 'Send to Player'}
        </Button>
      </div>
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const playerFilterPills = players.length > 0 ? (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 md:-mx-6 md:px-6">
      <button
        onClick={() => setSelectedPlayerId(null)}
        className={cn(
          'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 flex-shrink-0',
          selectedPlayerId === null
            ? 'bg-primary-600 text-white shadow-sm'
            : 'bg-cream-100/75 text-warm-600 hover:bg-white border border-warm-200/35',
        )}
      >
        All Players
      </button>
      {players.map(player => {
        const playerAreaCount = focusAreas.filter(fa => fa.player_id === player.id && fa.status !== 'completed').length;
        return (
          <button
            key={player.id}
            onClick={() => setSelectedPlayerId(player.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 flex-shrink-0',
              selectedPlayerId === player.id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-cream-100/75 text-warm-600 hover:bg-white border border-warm-200/35',
            )}
          >
            {player.first_name} {player.last_name?.[0]}.
            {playerAreaCount > 0 && (
              <span className={cn(
                'text-xs rounded-full w-5 h-5 flex items-center justify-center',
                selectedPlayerId === player.id
                  ? 'bg-white/20 text-white'
                  : 'bg-warm-100 text-warm-500',
              )}>
                {playerAreaCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="min-h-full">
      <LargeTitleHeader
        title="Development Plans"
        subtitle="Create and track focus areas for your players"
        belowContent={playerFilterPills}
      >
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
        >
          <IconPlus size={16} />
          <span className="hidden sm:inline">New Focus Area</span>
          <span className="sm:hidden">New</span>
        </Button>
      </LargeTitleHeader>

      {/* Summary stats */}
      {focusAreas.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="surface-matte rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <IconActivity size={14} className="text-primary-600" />
                <p className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">Active</p>
              </div>
              <p className="text-[24px] md:text-[28px] font-medium text-warm-900 tracking-[-0.022em]">{summaryStats.activeCount}</p>
              <p className="text-xs text-warm-500 mt-0.5">{summaryStats.playersWithAreas} player{summaryStats.playersWithAreas !== 1 ? 's' : ''}</p>
            </div>
            <div className="surface-matte rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <IconCheck size={14} className="text-primary-600" />
                <p className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">Completed</p>
              </div>
              <p className="text-[28px] md:text-[32px] font-light text-primary-700 tracking-[-0.025em]">{summaryStats.completedCount}</p>
              <p className="text-xs text-warm-500 mt-0.5">
                {summaryStats.total > 0 ? `${Math.round((summaryStats.completedCount / summaryStats.total) * 100)}% completion` : 'none yet'}
              </p>
            </div>
            <div className="surface-matte rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <IconTrendingUp size={14} className="text-blue-600" />
                <p className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">Avg Progress</p>
              </div>
              <p className="text-[24px] md:text-[28px] font-medium text-warm-900 tracking-[-0.022em]">{summaryStats.avgProgress}%</p>
              <div className="mt-1 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-[width] duration-500" style={{ width: `${summaryStats.avgProgress}%` }} />
              </div>
            </div>
            <div className="surface-matte rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <IconTarget size={14} className="text-violet-600" />
                <p className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">Total</p>
              </div>
              <p className="text-[28px] md:text-[32px] font-light text-warm-900 tabular-nums tracking-[-0.025em]">{summaryStats.total}</p>
              <p className="text-xs text-warm-500 mt-0.5">focus areas assigned</p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {players.length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconUser size={24} className="text-warm-400" />
            </div>
            <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">No Players Yet</h3>
            <p className="text-warm-500 text-sm max-w-sm mx-auto">
              Add players to your roster to create development plans and focus areas.
            </p>
          </div>
        ) : filteredFocusAreas.length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={24} className="text-primary-600" />
            </div>
            <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">No Focus Areas</h3>
            <p className="text-warm-500 text-sm mb-6 max-w-sm mx-auto">
              {selectedPlayerId
                ? 'Create a focus area for this player to help guide their development.'
                : 'Start creating focus areas for your players to track their progress.'}
            </p>
            <Button
              onClick={() => {
                resetForm();
                if (selectedPlayerId) {
                  setFormData(prev => ({ ...prev, player_id: selectedPlayerId }));
                }
                setIsCreateModalOpen(true);
              }}
            >
              <IconPlus size={16} className="mr-1.5" />
              Create First Focus Area
            </Button>
          </div>
        ) : selectedPlayerId ? (
          /* Single player view */
          <div className="space-y-3">
            {/* Player header */}
            {(() => {
              const p = players.find(pl => pl.id === selectedPlayerId);
              const stats = playerStats[selectedPlayerId];
              if (!p) return null;
              return (
                <div className="surface-matte rounded-3xl p-5 mb-4">
                  <div className="flex items-center gap-4">
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt={`${p.first_name} ${p.last_name}`} width={48} height={48} className="w-12 h-12 rounded-full object-cover" unoptimized />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary-600/90 flex items-center justify-center">
                        <span className="text-white font-medium text-base">{p.first_name?.[0]}{p.last_name?.[0]}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">{p.first_name} {p.last_name}</h2>
                      <div className="flex items-center gap-3 text-sm text-warm-500">
                        {p.handicap != null && <span>{p.handicap > 0 ? '+' : ''}{p.handicap} HCP</span>}
                        {stats?.avg_score != null && <span>Avg: {stats.avg_score}</span>}
                        {stats?.rounds_played != null && stats.rounds_played > 0 && <span>{stats.rounds_played} rounds</span>}
                        {stats?.recent_trend && (
                          <span className={cn(
                            'inline-flex items-center gap-1',
                            stats.recent_trend === 'improving' ? 'text-primary-600' : stats.recent_trend === 'declining' ? 'text-red-500' : 'text-warm-400',
                          )}>
                            {stats.recent_trend === 'improving' ? <IconTrendingDown size={13} /> : stats.recent_trend === 'declining' ? <IconTrendingUp size={13} /> : null}
                            {stats.recent_trend === 'improving' ? 'Improving' : stats.recent_trend === 'declining' ? 'Declining' : 'Stable'}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        resetForm();
                        setFormData(prev => ({ ...prev, player_id: selectedPlayerId }));
                        setIsCreateModalOpen(true);
                      }}
                    >
                      <IconPlus size={14} className="mr-1.5" />
                      Add
                    </Button>
                  </div>
                </div>
              );
            })()}
            {filteredFocusAreas.map((fa, i) => renderFocusAreaCard(fa, i))}
          </div>
        ) : (
          /* All players grouped view */
          <div className="space-y-6">
            {focusAreasByPlayer.map(({ player, areas, stats }) => (
              <div key={player.id} className="surface-matte rounded-3xl overflow-clip">
                {/* Player header */}
                <div className="flex items-center justify-between p-5 pb-0">
                  <div className="flex items-center gap-3">
                    {player.avatar_url ? (
                      <Image src={player.avatar_url} alt={`${player.first_name} ${player.last_name}`} width={40} height={40} className="w-10 h-10 rounded-full object-cover" unoptimized />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-600/90 flex items-center justify-center">
                        <span className="text-white font-medium text-sm">{player.first_name?.[0]}{player.last_name?.[0]}</span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-warm-900">{player.first_name} {player.last_name}</h3>
                      <div className="flex items-center gap-2 text-xs text-warm-500">
                        <span>{areas.length} focus area{areas.length !== 1 ? 's' : ''}</span>
                        {player.handicap != null && <span>{player.handicap > 0 ? '+' : ''}{player.handicap} HCP</span>}
                        {stats?.avg_score != null && <span>Avg: {stats.avg_score}</span>}
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedPlayerId(player.id)}>
                    View All
                  </Button>
                </div>

                {/* Focus areas list */}
                <div className="p-5 pt-3">
                  {areas.length === 0 ? (
                    <p className="text-sm text-warm-400 italic py-2">No focus areas assigned</p>
                  ) : (
                    <div className="space-y-2">
                      {areas.slice(0, 3).map(fa => {
                        const at = getAreaType(fa.area_type);
                        const status = getStatusOption(fa.status);
                        const pct = fa.target_value ? getProgressPercent(fa.current_value, fa.target_value) : null;

                        return (
                          <div key={fa.id} className="flex items-center gap-3 p-3 bg-warm-50/80 rounded-xl">
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', at.bgColor)}>
                              <at.icon size={14} className={at.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-warm-700 truncate">{fa.title}</span>
                                <span className={cn('px-1.5 py-0.5 text-xs font-medium rounded-full border flex-shrink-0', status.color)}>
                                  {status.label}
                                </span>
                              </div>
                              {pct !== null && (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1.5 bg-warm-200 rounded-full overflow-hidden">
                                    <div
                                      className={cn('h-full rounded-full transition-[width]', pct >= 100 ? 'bg-primary-500' : pct >= 50 ? 'bg-blue-500' : 'bg-warm-400')}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-warm-500 tabular-nums w-7 text-right">{pct}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {areas.length > 3 && (
                        <button
                          onClick={() => setSelectedPlayerId(player.id)}
                          className="w-full text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-2 rounded-lg hover:bg-primary-50 active:bg-primary-100 transition-colors"
                        >
                          +{areas.length - 3} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Sheet */}
      <BottomSheet
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="New Focus Area"
      >
        {renderFormContent(false)}
      </BottomSheet>

      {/* Edit Sheet */}
      <BottomSheet
        open={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setEditingFocusArea(null); }}
        title="Edit Focus Area"
      >
        {renderFormContent(true)}
      </BottomSheet>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
