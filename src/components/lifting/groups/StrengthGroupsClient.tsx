'use client';

// =============================================================================
// src/components/lifting/groups/StrengthGroupsClient.tsx
//
// Helm Lifting Lab — strength groups. Native Lab UI consuming HelmLifting*
// types. Three panes: LEFT = group list, CENTER = selected group's athlete
// table, RIGHT = create/edit group. Soft-remove for membership; soft-archive
// for groups. Cream/green palette; Card / Button / Modal / Checkbox verbatim.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { IconPlus, IconUsers, IconUserPlus, IconUserX, IconTrash } from '@/components/icons';
import {
  createGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
} from '@/app/lifting/actions/groups';
import type {
  HelmLiftingGroupRow,
  HelmLiftingGroupType,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

interface GroupWithMembers extends HelmLiftingGroupRow {
  member_count: number;
  member_athlete_ids: string[];
}

interface Props {
  groups: GroupWithMembers[];
  athletes: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>;
  orgId: string;
  canEdit: boolean;
}

const TYPE_META: Record<HelmLiftingGroupType, { label: string; cls: string }> = {
  static:    { label: 'Static',    cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  dynamic:   { label: 'Dynamic',   cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  imported:  { label: 'Imported',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  temporary: { label: 'Temp',      cls: 'bg-warm-50 text-warm-500 border-warm-200' },
};

export function StrengthGroupsClient({ groups: initialGroups, athletes, orgId, canEdit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    initialGroups[0]?.id ?? null,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<HelmLiftingGroupType>('static');
  const [newInitialIds, setNewInitialIds] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [athleteSearch, setAthleteSearch] = useState('');

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const groupAthletes = useMemo(() => {
    if (!selectedGroup) return [];
    const ids = new Set(selectedGroup.member_athlete_ids);
    return athletes.filter((a) => ids.has(a.id));
  }, [selectedGroup, athletes]);

  const nonMembers = useMemo(() => {
    if (!selectedGroup) return athletes;
    const ids = new Set(selectedGroup.member_athlete_ids);
    const q = athleteSearch.toLowerCase();
    return athletes.filter((a) => {
      if (ids.has(a.id)) return false;
      if (!q) return true;
      const name = [a.first_name, a.last_name].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q);
    });
  }, [selectedGroup, athletes, athleteSearch]);

  function handleCreate() {
    if (!newName.trim()) { setCreateError('Name is required.'); return; }
    setCreateError(null);
    startTransition(async () => {
      const result = await createGroup({
        orgId,
        name: newName.trim(),
        description: newDescription.trim() || null,
        groupType: newType,
        initialAthleteIds: [...newInitialIds],
      });
      if (result.success && result.id) {
        setShowCreate(false);
        setNewName('');
        setNewDescription('');
        setNewInitialIds(new Set());
        // Optimistically add the new group.
        const newGroup: GroupWithMembers = {
          id: result.id,
          organization_id: orgId,
          sport: 'baseball',
          team_id: null,
          name: newName.trim(),
          description: newDescription.trim() || null,
          group_type: newType,
          rule_json: {},
          created_by_coach_id: null,
          is_active: true,
          legacy_baseball_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          member_count: newInitialIds.size,
          member_athlete_ids: [...newInitialIds],
        };
        setGroups((prev) => [newGroup, ...prev]);
        setSelectedGroupId(result.id);
      } else {
        setCreateError(result.error ?? 'Failed to create group.');
      }
    });
  }

  function handleAddMember(athleteId: string) {
    if (!selectedGroup) return;
    startTransition(async () => {
      const result = await addGroupMember({ orgId, groupId: selectedGroup.id, athleteId });
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === selectedGroup.id
              ? { ...g, member_count: g.member_count + 1, member_athlete_ids: [...g.member_athlete_ids, athleteId] }
              : g,
          ),
        );
      } else {
        toast.error(result.error ?? 'Failed to add member.');
      }
    });
  }

  function handleRemoveMember(athleteId: string) {
    if (!selectedGroup) return;
    startTransition(async () => {
      const result = await removeGroupMember({ orgId, groupId: selectedGroup.id, athleteId });
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === selectedGroup.id
              ? {
                  ...g,
                  member_count: g.member_count - 1,
                  member_athlete_ids: g.member_athlete_ids.filter((id) => id !== athleteId),
                }
              : g,
          ),
        );
      } else {
        toast.error(result.error ?? 'Failed to remove member.');
      }
    });
  }

  function handleArchive(groupId: string) {
    startTransition(async () => {
      const result = await deleteGroup({ orgId, groupId });
      if (result.success) {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        if (selectedGroupId === groupId) setSelectedGroupId(groups[0]?.id ?? null);
      } else {
        toast.error(result.error ?? 'Failed to archive group.');
      }
    });
  }

  function athleteName(a: Pick<HelmLiftingAthleteRow, 'first_name' | 'last_name' | 'position' | 'sport'>) {
    return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unnamed';
  }

  return (
    <div className="flex h-full min-h-[600px] overflow-hidden">
      {/* LEFT — group list */}
      <aside className="w-64 shrink-0 border-r border-warm-100 bg-warm-50/50 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-warm-400">Groups</h2>
          {canEdit && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setShowCreate(true)}>
              <IconPlus size={12} /> New
            </Button>
          )}
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<IconUsers size={20} className="text-warm-300" />}
            title="No groups"
            description={canEdit ? 'Create a group to segment your room.' : 'No groups yet.'}
          />
        ) : (
          <div className="space-y-1">
            {groups.map((group) => {
              const typeMeta = TYPE_META[group.group_type];
              const isSelected = selectedGroupId === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full rounded-xl p-3 text-left transition-colors ${
                    isSelected ? 'bg-primary-50 border border-primary-100' : 'hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-800' : 'text-warm-800'}`}>
                      {group.name}
                    </p>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${typeMeta.cls}`}>
                      {typeMeta.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-warm-400 mt-0.5">
                    {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* CENTER — selected group athletes */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedGroup ? (
          <EmptyState
            icon={<IconUsers size={28} className="text-warm-300" />}
            title="Select a group"
            description="Choose a group from the left to manage its members."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-warm-900">{selectedGroup.name}</h2>
                {selectedGroup.description && (
                  <p className="text-sm text-warm-500 mt-0.5">{selectedGroup.description}</p>
                )}
                <p className="text-xs text-warm-400 mt-1">{selectedGroup.member_count} members</p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-warm-400 hover:text-red-600"
                  disabled={isPending}
                  onClick={() => handleArchive(selectedGroup.id)}
                >
                  <IconTrash size={14} className="mr-1" /> Archive
                </Button>
              )}
            </div>

            {/* Current members */}
            {groupAthletes.length === 0 ? (
              <EmptyState
                title="No members"
                description={canEdit ? 'Add athletes from the panel below.' : 'No members in this group.'}
              />
            ) : (
              <Card variant="flat">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-50 text-xs text-warm-400">
                        <th className="py-2.5 pl-4 text-left font-medium">Athlete</th>
                        <th className="py-2.5 px-3 text-left font-medium">Position</th>
                        {canEdit && <th className="py-2.5 pr-4 text-right font-medium">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-50">
                      {groupAthletes.map((a) => (
                        <tr key={a.id} className="hover:bg-warm-50/50 transition-colors">
                          <td className="py-2.5 pl-4 text-warm-800">{athleteName(a)}</td>
                          <td className="py-2.5 px-3 text-warm-500">{a.position ?? '—'}</td>
                          {canEdit && (
                            <td className="py-2.5 pr-4 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700"
                                disabled={isPending}
                                onClick={() => handleRemoveMember(a.id)}
                              >
                                <IconUserX size={13} className="mr-1" /> Remove
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Add members */}
            {canEdit && athletes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-400 mb-2">Add athletes</h3>
                <div className="mb-2">
                  <Input
                    placeholder="Search athletes…"
                    value={athleteSearch}
                    onChange={(e) => setAthleteSearch(e.target.value)}
                  />
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {nonMembers.slice(0, 30).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-warm-50 transition-colors"
                    >
                      <span className="text-sm text-warm-700">{athleteName(a)}{a.position ? ` · ${a.position}` : ''}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary-600"
                        disabled={isPending}
                        onClick={() => handleAddMember(a.id)}
                      >
                        <IconUserPlus size={13} /> Add
                      </Button>
                    </div>
                  ))}
                  {nonMembers.length === 0 && (
                    <p className="text-sm text-warm-400 px-3 py-2 italic">All athletes are already members.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create group modal */}
      {canEdit && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New group">
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pitchers, Catchers…"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Description</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Type</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TYPE_META).map(([val, meta]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNewType(val as HelmLiftingGroupType)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      newType === val ? `${meta.cls} ring-1 ring-primary-400` : meta.cls
                    }`}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Initial members */}
            {athletes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Initial members (optional)</label>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-warm-100 divide-y divide-warm-50">
                  {athletes.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-warm-50">
                      <Checkbox
                        checked={newInitialIds.has(a.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewInitialIds((prev) => {
                            const next = new Set(prev);
                            checked ? next.add(a.id) : next.delete(a.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm text-warm-700">
                        {athleteName(a)}{a.position ? ` · ${a.position}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
                {isPending ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
