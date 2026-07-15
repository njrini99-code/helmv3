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
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { IconPlus, IconUsers, IconUserPlus, IconUserX, IconTrash, IconLock } from '@/components/icons';
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
  loading?: boolean;
}

function StrengthGroupsSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-[600px] lg:flex-row lg:overflow-hidden">
      {/* Mobile tab switcher skeleton */}
      <div className="flex rounded-xl border border-warm-200 bg-warm-50 p-1 lg:hidden">
        <Skeleton className="h-7 flex-1 rounded-lg" />
        <Skeleton className="ml-1 h-7 flex-1 rounded-lg" />
      </div>
      {/* LEFT — hidden below lg; mobile shows the CENTER skeleton (this
          route's default tab) instead. */}
      <aside className="hidden w-full bg-warm-50/50 p-3 space-y-2 lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-warm-100">
        <div className="flex items-center justify-between mb-3 px-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-3 space-y-1.5" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </aside>
      {/* CENTER */}
      <main className="flex-1 p-4 space-y-4 lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="rounded-2xl border border-warm-100 glass-standard overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-warm-50 last:border-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-7 w-20 rounded-lg ml-auto" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const TYPE_META: Record<HelmLiftingGroupType, { label: string; cls: string }> = {
  static:    { label: 'Static',    cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  dynamic:   { label: 'Dynamic',   cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  imported:  { label: 'Imported',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  temporary: { label: 'Temp',      cls: 'bg-warm-50 text-warm-500 border-warm-200' },
};

// Dynamic groups (group_type='dynamic') are rule-managed: their membership is
// computed server-side from rule_json, not maintained by hand — no rename/
// archive/add-remove-member UI exists for them yet (that's the "unified Lab"
// rule editor, tracked separately). This client renders them read-only with
// this explanation rather than silently letting a coach "remove" a member the
// rule will just re-add on the next recompute.
const DYNAMIC_GROUP_TOOLTIP = 'Rule-managed group — edited rules coming to the unified Lab.';

/**
 * Defensive, best-effort human summary of a dynamic group's rule_json.
 *
 * The unified helm_lifting_groups.rule_json is expected to follow the same
 * predicate shape as the legacy baseball_strength_groups rule engine
 * (positions / grad_years / availability_statuses / thresholds — see
 * BaseballStrengthGroupRules in lib/types/baseball-lifting-v11.ts), but this
 * client never assumes that shape holds for every row: rule_json is typed
 * `Json` (any JSON value) at the DB layer, golf groups may shape it
 * differently, and prod rows may be sparse or malformed. Every access below
 * is a runtime type-check, not a cast — an unrecognized/empty/non-object
 * shape degrades to a generic label instead of throwing or rendering
 * "undefined".
 */
function summarizeRuleJson(rule: unknown): string {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return 'Rule-managed group';
  }
  const r = rule as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const asNumberArray = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

  const parts: string[] = [];

  const positions = asStringArray(r.positions);
  if (positions.length > 0) parts.push(`Position: ${positions.join(', ')}`);

  const gradYears = asNumberArray(r.grad_years);
  if (gradYears.length > 0) parts.push(`Class: ${gradYears.join(', ')}`);

  const availability = asStringArray(r.availability_statuses);
  if (availability.length > 0) parts.push(`Availability: ${availability.join(', ')}`);

  if (typeof r.min_recent_pitch_count === 'number') {
    parts.push(`Pitch count ≥ ${r.min_recent_pitch_count}`);
  }
  if (typeof r.min_soreness_severity === 'number') {
    parts.push(`Soreness ≥ ${r.min_soreness_severity}`);
  }
  if (typeof r.bodyweight_min === 'number' || typeof r.bodyweight_max === 'number') {
    const lo = typeof r.bodyweight_min === 'number' ? r.bodyweight_min : '—';
    const hi = typeof r.bodyweight_max === 'number' ? r.bodyweight_max : '—';
    parts.push(`Bodyweight ${lo}–${hi} lb`);
  }
  if (typeof r.lift_completion === 'string') {
    parts.push(`Lift status: ${r.lift_completion}`);
  }

  if (parts.length === 0) {
    const keyCount = Object.keys(r).length;
    return keyCount > 0
      ? `Custom rule (${keyCount} condition${keyCount === 1 ? '' : 's'})`
      : 'Rule-managed group';
  }

  const matchAny = r.match === 'any';
  return `${matchAny ? 'Matches any — ' : ''}${parts.join(' · ')}`;
}

export function StrengthGroupsClient({ groups: initialGroups, athletes, orgId, canEdit, loading = false }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    initialGroups[0]?.id ?? null,
  );
  // Mobile tab — which pane is visible below `lg` (mirrors LiftCanvas's own
  // mobile tab-switcher). Defaults to 'detail' since a group is typically
  // preselected already.
  const [activePane, setActivePane] = useState<'list' | 'detail'>('detail');
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

  // Dynamic groups are rule-managed — see DYNAMIC_GROUP_TOOLTIP above for why
  // rename/archive/add-remove-member affordances are disabled for them.
  const isSelectedDynamic = selectedGroup?.group_type === 'dynamic';

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

  if (loading) return <StrengthGroupsSkeleton />;

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
        setActivePane('detail');
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
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-[600px] lg:flex-row lg:overflow-hidden">
      {/* ── Mobile tab switcher (mirrors LiftCanvas's own mobile tab pattern
          one level up in the same vertical) — the group list and the
          selected group's detail stack below `lg`; picking a group jumps
          straight to its detail pane. ── */}
      <div
        className="flex rounded-xl border border-warm-200 bg-warm-50 p-1 lg:hidden"
        role="tablist"
        aria-label="Strength groups section"
      >
        {(
          [
            { id: 'list', label: 'Groups' },
            { id: 'detail', label: 'Members' },
          ] as const
        ).map(({ id, label }) => (
          <Button
            key={id}
            variant="ghost"
            type="button"
            role="tab"
            aria-selected={activePane === id}
            onClick={() => setActivePane(id)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              activePane === id
                ? 'bg-cream-50 text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* LEFT — group list */}
      <aside
        className={[
          'w-full overflow-y-auto bg-warm-50/50 p-3',
          'lg:w-64 lg:shrink-0 lg:border-r lg:border-warm-100',
          activePane === 'list' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        ].join(' ')}
      >
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
            variant="minimal"
            icon={<IconUsers size={20} className="text-warm-300" />}
            title="No groups yet"
            description={canEdit ? 'Create a group to segment your weight room.' : 'No groups yet.'}
          />
        ) : (
          <div className="space-y-1">
            <AnimatePresence initial={false}>
              {groups.map((group, i) => {
                const typeMeta = TYPE_META[group.group_type];
                const isSelected = selectedGroupId === group.id;
                return (
                  <motion.div
                    key={group.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18, delay: i * 0.04 }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { setSelectedGroupId(group.id); setActivePane('detail'); }}
                      className={`w-full rounded-xl p-3 text-left transition-colors focus-visible:ring-primary-500/50 ${
                        isSelected ? 'bg-primary-50 border border-primary-100' : 'hover:bg-cream-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-800' : 'text-warm-800'}`}>
                          {group.name}
                        </p>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-microbadge font-medium ${typeMeta.cls}`}>
                          {typeMeta.label}
                        </span>
                      </div>
                      <p className="text-eyebrow text-warm-400 mt-0.5">
                        {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                      </p>
                      {group.group_type === 'dynamic' && (
                        <p
                          className="text-eyebrow text-primary-600/80 mt-0.5 truncate"
                          title={summarizeRuleJson(group.rule_json)}
                        >
                          {summarizeRuleJson(group.rule_json)}
                        </p>
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </aside>

      {/* CENTER — selected group athletes */}
      <main
        className={`flex-1 overflow-y-auto p-4 lg:p-6 ${
          activePane === 'detail' ? 'block' : 'hidden lg:block'
        }`}
      >
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
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-warm-900">{selectedGroup.name}</h2>
                  {isSelectedDynamic && (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-full border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-microbadge font-medium text-primary-700">
                      <IconLock size={10} /> Dynamic
                    </span>
                  )}
                </div>
                {selectedGroup.description && (
                  <p className="text-sm text-warm-500 mt-0.5">{selectedGroup.description}</p>
                )}
                <p className="text-xs text-warm-400 mt-1">{selectedGroup.member_count} members</p>
                {isSelectedDynamic && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-primary-100 bg-primary-50/60 px-2.5 py-1.5 text-xs text-primary-700">
                    <IconLock size={12} className="mt-0.5 shrink-0" />
                    <span>{summarizeRuleJson(selectedGroup.rule_json)}</span>
                  </div>
                )}
              </div>
              {canEdit && (
                isSelectedDynamic ? (
                  <Tooltip content={DYNAMIC_GROUP_TOOLTIP}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-warm-300"
                      disabled
                    >
                      <IconTrash size={14} className="mr-1" /> Archive
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-warm-400 hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleArchive(selectedGroup.id)}
                  >
                    <IconTrash size={14} className="mr-1" /> Archive
                  </Button>
                )
              )}
            </div>

            {/* Current members */}
            {groupAthletes.length === 0 ? (
              <EmptyState
                title="No members"
                description={
                  isSelectedDynamic
                    ? 'No athletes currently match this group’s rule.'
                    : canEdit
                      ? 'Add athletes from the panel below.'
                      : 'No members in this group.'
                }
              />
            ) : (
              <Card variant="flat">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
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
                              {isSelectedDynamic ? (
                                <Tooltip content={DYNAMIC_GROUP_TOOLTIP}>
                                  <Button size="sm" variant="ghost" className="text-warm-300" disabled>
                                    <IconUserX size={13} className="mr-1" /> Remove
                                  </Button>
                                </Tooltip>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive/80 hover:text-destructive"
                                  disabled={isPending}
                                  onClick={() => handleRemoveMember(a.id)}
                                >
                                  <IconUserX size={13} className="mr-1" /> Remove
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add members */}
            {canEdit && athletes.length > 0 && (
              isSelectedDynamic ? (
                <Tooltip content={DYNAMIC_GROUP_TOOLTIP}>
                  <div className="rounded-xl border border-warm-100 bg-warm-50/50 px-3 py-2.5 cursor-not-allowed">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warm-400">
                      <IconLock size={11} /> Add athletes
                    </h3>
                    <p className="text-xs text-warm-400 mt-1">
                      Membership is computed from this group’s rule — manual add is disabled.
                    </p>
                  </div>
                </Tooltip>
              ) : (
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
              )
            )}
          </div>
        )}
      </main>

      {/* Create group modal */}
      {canEdit && (
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New group">
          <div className="space-y-4 p-1">
            <div>
              <Input
                label="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pitchers, Catchers…"
              />
            </div>
            <div>
              <Textarea
                label="Description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
            <div>
              <p className="block text-sm font-medium text-warm-700 mb-1">Type</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(TYPE_META).map(([val, meta]) => (
                  <Button
                    key={val}
                    type="button"
                    variant="ghost"
                    onClick={() => setNewType(val as HelmLiftingGroupType)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      newType === val ? `${meta.cls} ring-1 ring-primary-400` : meta.cls
                    }`}
                  >
                    {meta.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Initial members */}
            {athletes.length > 0 && (
              <div>
                <p className="block text-sm font-medium text-warm-700 mb-1">Initial members (optional)</p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-warm-100 divide-y divide-warm-50">
                  {athletes.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-warm-50">
                      <Checkbox
                        checked={newInitialIds.has(a.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewInitialIds((prev) => {
                            const next = new Set(prev);
                            if (checked) { next.add(a.id); } else { next.delete(a.id); }
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

            {createError && <p className="text-sm text-destructive">{createError}</p>}
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
