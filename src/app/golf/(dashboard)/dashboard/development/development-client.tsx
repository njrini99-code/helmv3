'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  IconPlus,
  IconTarget,
  IconUser,
  IconCheck,
} from '@/components/icons';
import { createFocusArea, updateFocusArea, deleteFocusArea } from '@/app/golf/actions/development';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  grad_year: number | null;
  handicap: number | null;
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

interface DevelopmentPlansClientProps {
  players: Player[];
  focusAreas: FocusArea[];
  coachId: string;
}

const AREA_TYPES = [
  { value: 'driving', label: 'Driving', icon: '🏌️' },
  { value: 'iron_play', label: 'Iron Play', icon: '⛳' },
  { value: 'short_game', label: 'Short Game', icon: '🎯' },
  { value: 'putting', label: 'Putting', icon: '🕳️' },
  { value: 'course_management', label: 'Course Management', icon: '🗺️' },
  { value: 'mental_game', label: 'Mental Game', icon: '🧠' },
  { value: 'fitness', label: 'Fitness', icon: '💪' },
  { value: 'other', label: 'Other', icon: '📋' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', color: 'bg-slate-100 text-slate-600' },
  { value: 'paused', label: 'Paused', color: 'bg-amber-100 text-amber-700' },
];

export function DevelopmentPlansClient({
  players,
  focusAreas,
  coachId,
}: DevelopmentPlansClientProps) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFocusArea, setEditingFocusArea] = useState<FocusArea | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // Filter focus areas by selected player
  const filteredFocusAreas = selectedPlayerId
    ? focusAreas.filter(fa => fa.player_id === selectedPlayerId)
    : focusAreas;

  // Group focus areas by player for overview
  const focusAreasByPlayer = players.map(player => ({
    player,
    areas: focusAreas.filter(fa => fa.player_id === player.id),
  }));

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
      // Error creating focus area
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
      // Error updating focus area
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
      // Error deleting focus area
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
      // Error updating status
    }
  };

  const getProgressPercent = (current: number | null, target: number | null) => {
    if (!current || !target || target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Development Plans
              </h1>
              <p className="text-slate-500 mt-0.5">
                {focusAreas.length} focus area{focusAreas.length !== 1 ? 's' : ''} across {players.length} player{players.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setIsCreateModalOpen(true);
              }}
            >
              <IconPlus size={16} className="mr-2" />
              Add Focus Area
            </Button>
          </div>

          {/* Player Filter Tabs */}
          {players.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedPlayerId(null)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  selectedPlayerId === null
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                All Players
              </button>
              {players.map(player => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    selectedPlayerId === player.id
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {player.first_name} {player.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {players.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconUser size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
            <p className="text-slate-500">Add players to your team to create development plans.</p>
          </div>
        ) : filteredFocusAreas.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Focus Areas</h3>
            <p className="text-slate-500 mb-6">
              {selectedPlayerId
                ? 'Create a development focus area for this player.'
                : 'Start by creating focus areas for your players.'}
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
              <IconPlus size={16} className="mr-2" />
              Add First Focus Area
            </Button>
          </div>
        ) : selectedPlayerId ? (
          // Single player view - show cards
          <div className="space-y-4">
            {filteredFocusAreas.map((fa, index) => (
              <div
                key={fa.id}
                className="relative glass-standard rounded-xl overflow-hidden"
                style={{
                  animation: 'fadeInUp 0.4s ease-out forwards',
                  animationDelay: `${index * 50}ms`,
                  opacity: 0,
                }}
              >
                <ShineEffect />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-xl">
                        {AREA_TYPES.find(t => t.value === fa.area_type)?.icon || '📋'}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{fa.title}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {AREA_TYPES.find(t => t.value === fa.area_type)?.label || fa.area_type}
                        </p>
                        {fa.description && (
                          <p className="text-sm text-slate-600 mt-2">{fa.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-full',
                          STATUS_OPTIONS.find(s => s.value === fa.status)?.color || 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {STATUS_OPTIONS.find(s => s.value === fa.status)?.label || fa.status}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar if metrics exist */}
                  {fa.target_value && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-500">{fa.target_metric || 'Progress'}</span>
                        <span className="font-medium text-slate-700">
                          {fa.current_value || 0} / {fa.target_value}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${getProgressPercent(fa.current_value, fa.target_value)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(fa)}>
                      Edit
                    </Button>
                    {fa.status !== 'completed' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkComplete(fa)}
                      >
                        <IconCheck size={14} className="mr-1" />
                        Mark Complete
                      </Button>
                    )}
                    <button
                      onClick={() => handleDelete(fa.id)}
                      className="ml-auto text-sm text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // All players overview - show grouped by player
          <div className="space-y-6">
            {focusAreasByPlayer.map(({ player, areas }) => (
              <div key={player.id} className="relative glass-standard rounded-xl overflow-hidden">
                <ShineEffect />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-sm">
                        <span className="text-white font-semibold text-sm">
                          {player.first_name?.[0]}{player.last_name?.[0]}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {player.first_name} {player.last_name}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {areas.length} focus area{areas.length !== 1 ? 's' : ''}
                          {player.handicap !== null && ` • ${player.handicap > 0 ? '+' : ''}${player.handicap} HCP`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedPlayerId(player.id)}
                    >
                      View All
                    </Button>
                  </div>

                  {areas.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No focus areas assigned</p>
                  ) : (
                    <div className="space-y-2">
                      {areas.slice(0, 3).map(fa => (
                        <div
                          key={fa.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {AREA_TYPES.find(t => t.value === fa.area_type)?.icon || '📋'}
                            </span>
                            <span className="font-medium text-slate-700">{fa.title}</span>
                          </div>
                          <span
                            className={cn(
                              'px-2 py-0.5 text-xs font-medium rounded-full',
                              STATUS_OPTIONS.find(s => s.value === fa.status)?.color
                            )}
                          >
                            {STATUS_OPTIONS.find(s => s.value === fa.status)?.label || fa.status}
                          </span>
                        </div>
                      ))}
                      {areas.length > 3 && (
                        <p className="text-sm text-slate-500 text-center pt-2">
                          +{areas.length - 3} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Focus Area"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Player
            </label>
            <select
              value={formData.player_id}
              onChange={e => setFormData({ ...formData, player_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 bg-white"
            >
              <option value="">Select a player</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Focus Area Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AREA_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, area_type: type.value })}
                  className={cn(
                    'p-3 rounded-xl border-2 text-center transition-all',
                    formData.area_type === type.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className="text-xl block mb-1">{type.icon}</span>
                  <span className="text-xs font-medium text-slate-700">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Improve putting from 10 feet"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Add details about this focus area..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Target Metric
              </label>
              <input
                type="text"
                value={formData.target_metric}
                onChange={e => setFormData({ ...formData, target_metric: e.target.value })}
                placeholder="e.g., Make %"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Current Value
              </label>
              <input
                type="number"
                value={formData.current_value}
                onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Target Value
              </label>
              <input
                type="number"
                value={formData.target_value}
                onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                placeholder="100"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.player_id || !formData.title || isSaving}
              isLoading={isSaving}
            >
              Create Focus Area
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingFocusArea(null);
        }}
        title="Edit Focus Area"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Focus Area Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AREA_TYPES.map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, area_type: type.value })}
                  className={cn(
                    'p-3 rounded-xl border-2 text-center transition-all',
                    formData.area_type === type.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className="text-xl block mb-1">{type.icon}</span>
                  <span className="text-xs font-medium text-slate-700">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Target Metric
              </label>
              <input
                type="text"
                value={formData.target_metric}
                onChange={e => setFormData({ ...formData, target_metric: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Current Value
              </label>
              <input
                type="number"
                value={formData.current_value}
                onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Target Value
              </label>
              <input
                type="number"
                value={formData.target_value}
                onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingFocusArea(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.title || isSaving} isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
