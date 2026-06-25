'use client';

// =============================================================================
// src/components/baseball/performance/StrengthGroupsClient.tsx
//
// V11 Strength Groups builder (spec L151-198 + Packet C). Hand-composed for the
// strength coach's ONE primary task here: segment the room. Three deliberate panes
// (spec L191-197), not a generic grid:
//
//   LEFT   — group list with member counts + a status badge (static/dynamic/
//            archived). The coach's index of the room; one prominent "New group".
//   CENTER — the selected group's athlete table with a filter bar (position /
//            class / availability) and quick add/remove per row (calls
//            setGroupMembers). For a dynamic group it also shows the rule-matched
//            set so manual pins vs rule members read clearly.
//   RIGHT  — the rule builder + LIVE PREVIEW. Every edit re-evaluates SERVER-SIDE
//            (previewDynamicGroup — one engine, no client re-implementation) and
//            lists the EXACT included players before the coach saves. Save commits
//            the rule (updateStrengthGroup) and recomputes membership
//            (recomputeDynamicGroup), which writes the audit ledger (spec L198).
//
// Cream/green GolfHelm palette only; Card / Button / Input / Select / Modal /
// Checkbox / EmptyState verbatim. Status uses color PLUS label. This wires the
// previously-orphaned createStrengthGroup + setGroupMembers and the new dynamic
// engine actions.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconPlus, IconUsers, IconUserPlus, IconUserX, IconFilter,
  IconSparkles, IconTrash, IconCheck, IconBolt,
} from '@/components/icons';
import {
  createStrengthGroup,
  setGroupMembers,
  updateStrengthGroup,
  deleteStrengthGroup,
  recomputeDynamicGroup,
  previewDynamicGroup,
  seedDefaultStrengthGroups,
} from '@/app/baseball/actions/lifting-v11';
import type { StrengthGroupListItem } from '@/lib/baseball/read-models/strength-groups';
import type { PlayerRuleAttributes, RuleMatch } from '@/lib/baseball/lifting/strength-group-rules';
import type {
  BaseballStrengthGroupType,
  BaseballStrengthGroupRules,
  BaseballAvailabilityStatus,
} from '@/lib/types/baseball-lifting-v11';

// -----------------------------------------------------------------------------
// Static option vocabularies
// -----------------------------------------------------------------------------

const TYPE_META: Record<BaseballStrengthGroupType, { label: string; cls: string }> = {
  static: { label: 'Static', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  dynamic: { label: 'Dynamic', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  imported: { label: 'Imported', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  temporary: { label: 'Temporary', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
};

const POSITION_OPTIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTL'];
const AVAILABILITY_OPTIONS: Array<{ value: BaseballAvailabilityStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited' },
  { value: 'hold', label: 'Hold' },
  { value: 'return_to_play', label: 'Return to play' },
  { value: 'unavailable', label: 'Unavailable' },
];

function fullName(p: { first_name: string | null; last_name: string | null }): string {
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed';
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

interface Props {
  groups: StrengthGroupListItem[];
  roster: PlayerRuleAttributes[];
  defaultGroupsPresent: number;
}

export function StrengthGroupsClient({ groups, roster, defaultGroupsPresent }: Props) {
  const activeGroups = useMemo(() => groups.filter((g) => g.is_active), [groups]);
  const [selectedId, setSelectedId] = useState<string | null>(activeGroups[0]?.id ?? null);
  const selected = useMemo(
    () => activeGroups.find((g) => g.id === selectedId) ?? null,
    [activeGroups, selectedId],
  );
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="space-y-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Header
        groupCount={activeGroups.length}
        defaultGroupsPresent={defaultGroupsPresent}
        roster={roster}
      />

      {activeGroups.length === 0 ? (
        <Card className="p-10">
          <EmptyState
            icon={<IconUsers size={40} />}
            title="No groups yet"
            description="Groups are how you organize the weight room — by position, role, readiness, or workload. Seed the 12 defaults or build your own."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
          <GroupListPane groups={activeGroups} selectedId={selectedId} onSelect={setSelectedId} />
          {selected ? (
            <>
              <AthletePane key={`a-${selected.id}`} group={selected} roster={roster} />
              <RulePane key={`r-${selected.id}`} group={selected} />
            </>
          ) : (
            <Card className="p-8 lg:col-span-2">
              <EmptyState
                icon={<IconUsers size={36} />}
                title="Select a group"
                description="Pick a group on the left to manage its athletes and rule."
              />
            </Card>
          )}
        </div>
      )}
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// Header — breadcrumb, title, seed CTA, new-group
// -----------------------------------------------------------------------------

function Header({
  groupCount, defaultGroupsPresent, roster,
}: { groupCount: number; defaultGroupsPresent: number; roster: PlayerRuleAttributes[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [seedErr, setSeedErr] = useState<string | null>(null);

  function handleSeed() {
    setSeedErr(null);
    startTransition(async () => {
      try {
        const res = await seedDefaultStrengthGroups();
        if (!res.success) setSeedErr(res.error ?? 'Could not seed default groups.');
      } catch {
        setSeedErr('Could not seed default groups. Please try again.');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-warm-400">
          <Link href="/baseball/dashboard/performance" className="rounded transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">Performance</Link>
          <span aria-hidden>/</span>
          <span className="text-warm-600" aria-current="page">Groups</span>
        </nav>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">Strength groups</h1>
        <p className="text-sm text-warm-500">
          Segment the room by position, role, readiness, or workload — then publish lifts to a whole
          group at once. {groupCount} active · {roster.length} athletes.
        </p>
        {seedErr && <p className="mt-1 text-sm text-red-600">{seedErr}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {defaultGroupsPresent < 12 && (
          <Button variant="outline" leftIcon={<IconSparkles size={16} />} onClick={handleSeed} isLoading={pending}>
            Seed defaults ({12 - defaultGroupsPresent} left)
          </Button>
        )}
        <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          New group
        </Button>
      </div>
      <NewGroupModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<BaseballStrengthGroupType>('static');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(''); setDescription(''); setType('static'); setError(null);
  }
  function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setError('Give the group a name.'); return; }
    startTransition(async () => {
      try {
        const res = await createStrengthGroup({ name: trimmed, description: description.trim() || null, groupType: type, ruleJson: {} });
        if (res.success) { reset(); onClose(); }
        else setError(res.error ?? 'Could not create the group.');
      } catch {
        setError('Could not create the group. Please try again.');
      }
    });
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="New strength group">
      <div className="space-y-4">
        <Input label="Group name" placeholder="e.g. High Workload Watch" value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} />
        <Textarea label="Description (optional)" placeholder="Who is this group for, and why?" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <Select
          label="Membership type"
          options={[
            { value: 'static', label: 'Static — you pick the athletes' },
            { value: 'dynamic', label: 'Dynamic — membership follows a rule' },
            { value: 'temporary', label: 'Temporary — for a week or event' },
          ]}
          value={type}
          onChange={(v) => setType(v as BaseballStrengthGroupType)}
        />
        <p className="text-xs text-warm-400">
          Dynamic groups stay in sync with your roster — set the rule after creating, then recompute.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} isLoading={pending}>Create group</Button>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// LEFT — group list with counts + status badge
// -----------------------------------------------------------------------------

function GroupListPane({
  groups, selectedId, onSelect,
}: { groups: StrengthGroupListItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Card className="h-fit overflow-hidden p-0">
      <div className="border-b border-warm-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-warm-400">
        Groups <span className="tabular-nums text-warm-300">({groups.length})</span>
      </div>
      <ul className="divide-y divide-warm-50">
        {groups.map((g) => {
          const meta = TYPE_META[g.group_type];
          const active = g.id === selectedId;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onSelect(g.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 ${
                  active ? 'bg-primary-50/60' : 'hover:bg-warm-50'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                <div className="min-w-0">
                  <div className={`truncate text-sm font-medium ${active ? 'text-primary-800' : 'text-warm-900'}`}>
                    {g.name}
                  </div>
                  <span className={`mt-0.5 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-warm-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-warm-700">
                  {g.member_count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// CENTER — athlete table with filters + quick add/remove
// -----------------------------------------------------------------------------

function AthletePane({ group, roster }: { group: StrengthGroupListItem; roster: PlayerRuleAttributes[] }) {
  // Optimistic membership set, seeded from the server snapshot.
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(group.member_ids));
  const [posFilter, setPosFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Debounce the persist so rapid toggles coalesce into one write.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when the selected group changes (keyed remount also covers this).
  useEffect(() => { setMemberIds(new Set(group.member_ids)); }, [group.id, group.member_ids]);

  const persist = useCallback((next: Set<string>) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await setGroupMembers({ groupId: group.id, playerIds: Array.from(next), source: 'manual' });
          if (!res.success) setError(res.error ?? 'Could not save membership.');
          else setError(null);
        } catch {
          setError('Could not save membership. Please try again.');
        }
      });
    }, 500);
  }, [group.id]);

  function toggle(pid: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      persist(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((p) => {
      if (posFilter && p.primary_position !== posFilter && p.secondary_position !== posFilter) return false;
      if (availFilter && p.availability_status !== availFilter) return false;
      if (q && !fullName(p).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, posFilter, availFilter, search]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-warm-900">{group.name}</h2>
          <p className="text-xs text-warm-500" aria-live="polite">
            <span className="tabular-nums">{memberIds.size}</span> in group · <span className="tabular-nums">{roster.length}</span> on roster
            {pending && <span className="ml-2 text-primary-600">Saving…</span>}
            {error && <span className="ml-2 text-red-600">{error}</span>}
          </p>
        </div>
      </div>

      {/* Filter bar (spec L194) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-warm-50 bg-cream-100/40 px-4 py-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-warm-400"><IconFilter size={14} /> Filter</span>
        <Input className="h-8 w-40" placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          className="w-32"
          options={[{ value: '', label: 'Any position' }, ...POSITION_OPTIONS.map((p) => ({ value: p, label: p }))]}
          value={posFilter}
          onChange={setPosFilter}
        />
        <Select
          className="w-40"
          options={[{ value: '', label: 'Any availability' }, ...AVAILABILITY_OPTIONS]}
          value={availFilter}
          onChange={setAvailFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-10">
          <EmptyState icon={<IconUsers size={32} />} title="No athletes match" description="Adjust the filters above to find athletes to add." />
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white/95 backdrop-blur">
              <tr className="border-b border-warm-100 text-left text-xs font-medium text-warm-400">
                <th className="px-4 py-2">Athlete</th>
                <th className="px-2 py-2">Pos</th>
                <th className="px-2 py-2">Avail.</th>
                <th className="px-2 py-2 text-right">BW</th>
                <th className="px-4 py-2 text-right">In group</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const inGroup = memberIds.has(p.player_id);
                return (
                  <tr key={p.player_id} className={`border-b border-warm-50 ${inGroup ? 'bg-primary-50/30' : ''}`}>
                    <td className="px-4 py-2 font-medium text-warm-900">{fullName(p)}</td>
                    <td className="px-2 py-2 text-warm-600">{p.primary_position ?? '—'}</td>
                    <td className="px-2 py-2 text-warm-600">{p.availability_status ?? '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-warm-600">{p.bodyweight_lbs ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant={inGroup ? 'secondary' : 'outline'}
                        size="sm"
                        leftIcon={inGroup ? <IconUserX size={14} /> : <IconUserPlus size={14} />}
                        onClick={() => toggle(p.player_id)}
                      >
                        {inGroup ? 'Remove' : 'Add'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// RIGHT — rule builder + live preview
// -----------------------------------------------------------------------------

function emptyRule(): BaseballStrengthGroupRules {
  return { match: 'all', lookback_days: 14 };
}

function RulePane({ group }: { group: StrengthGroupListItem }) {
  const initial = useMemo<BaseballStrengthGroupRules>(
    () => ({ ...emptyRule(), ...((group.rule_json as BaseballStrengthGroupRules) ?? {}) }),
    [group.rule_json],
  );
  const [rule, setRule] = useState<BaseballStrengthGroupRules>(initial);
  const [preview, setPreview] = useState<{ matches: RuleMatch[]; empty: boolean } | null>(null);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();
  // Message carries a tone so a failure reads red and a success reads green —
  // the old single string rendered every message (including errors) in green.
  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const ok = (text: string) => setMsg({ text, tone: 'success' });
  const fail = (text: string) => setMsg({ text, tone: 'error' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDynamic = group.group_type === 'dynamic';

  // Live preview: re-evaluate server-side (debounced) on every rule change.
  useEffect(() => {
    if (!isDynamic) return undefined;
    const t = setTimeout(() => {
      startPreview(async () => {
        try {
          const res = await previewDynamicGroup({ ruleJson: rule as Record<string, unknown>, lookbackDays: rule.lookback_days });
          if (res.success) setPreview({ matches: res.matches ?? [], empty: Boolean(res.empty_rule) });
        } catch { /* preview is best-effort; keep last result */ }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [rule, isDynamic]);

  function patch(p: Partial<BaseballStrengthGroupRules>) {
    setRule((prev) => ({ ...prev, ...p }));
  }
  function toggleArray<K extends 'positions' | 'availability_statuses'>(key: K, value: string) {
    setRule((prev) => {
      const cur = (prev[key] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [key]: next.length ? next : undefined };
    });
  }

  function handleSave() {
    setMsg(null);
    startSave(async () => {
      try {
        const upd = await updateStrengthGroup({ groupId: group.id, ruleJson: rule as Record<string, unknown> });
        if (!upd.success) { fail(upd.error ?? 'Could not save the rule.'); return; }
        const rec = await recomputeDynamicGroup({ groupId: group.id });
        if (!rec.success) { fail(rec.error ?? 'Saved rule, but recompute failed.'); return; }
        ok(`Saved · ${rec.count ?? 0} athletes now match.`);
      } catch {
        fail('Could not save the rule. Please try again.');
      }
    });
  }

  function handleDelete() {
    startSave(async () => {
      try {
        const res = await deleteStrengthGroup({ groupId: group.id });
        if (!res.success) fail(res.error ?? 'Could not archive the group.');
      } catch { fail('Could not archive the group.'); }
    });
  }

  function switchToDynamic() {
    startSave(async () => {
      try {
        const res = await updateStrengthGroup({ groupId: group.id, groupType: 'dynamic', ruleJson: rule as Record<string, unknown> });
        if (!res.success) fail(res.error ?? 'Could not switch to dynamic.');
        else ok('Now a dynamic group — set a rule and save to populate.');
      } catch { fail('Could not switch to dynamic.'); }
    });
  }

  return (
    <Card className="flex h-fit flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-warm-900">
          <IconBolt size={16} className="text-primary-600" /> Rule builder
        </h2>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TYPE_META[group.group_type].cls}`}>
          {TYPE_META[group.group_type].label}
        </span>
      </div>

      {!isDynamic ? (
        <div className="space-y-3">
          <p className="text-sm text-warm-500">
            This is a <strong>{TYPE_META[group.group_type].label.toLowerCase()}</strong> group — membership is
            managed by hand in the athlete table. Switch it to dynamic to drive membership from a rule.
          </p>
          <Button variant="outline" leftIcon={<IconSparkles size={16} />} onClick={switchToDynamic} isLoading={saving}>
            Make this group dynamic
          </Button>
        </div>
      ) : (
        <>
          {/* Match mode */}
          <Select
            label="Match"
            options={[{ value: 'all', label: 'Match ALL of the rules' }, { value: 'any', label: 'Match ANY of the rules' }]}
            value={rule.match ?? 'all'}
            onChange={(v) => patch({ match: v as 'all' | 'any' })}
          />

          {/* Positions */}
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-warm-500">Position</legend>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((pos) => {
                const on = rule.positions?.includes(pos);
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => toggleArray('positions', pos)}
                    aria-pressed={Boolean(on)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      on ? 'border-primary-300 bg-primary-100 text-primary-800' : 'border-warm-200 bg-white text-warm-600 hover:bg-warm-50'
                    }`}
                  >
                    {pos}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Availability */}
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-warm-500">Availability status</legend>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABILITY_OPTIONS.map((opt) => {
                const on = rule.availability_statuses?.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleArray('availability_statuses', opt.value)}
                    aria-pressed={Boolean(on)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      on ? 'border-primary-300 bg-primary-100 text-primary-800' : 'border-warm-200 bg-white text-warm-600 hover:bg-warm-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Numeric thresholds */}
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Min recent pitches" value={rule.min_recent_pitch_count} onChange={(n) => patch({ min_recent_pitch_count: n })} />
            <NumField label="Min recent starts" value={rule.min_recent_game_starts} onChange={(n) => patch({ min_recent_game_starts: n })} />
            <NumField label="Min soreness (0-10)" value={rule.min_soreness_severity} onChange={(n) => patch({ min_soreness_severity: n })} />
            <NumField label="Lookback (days)" value={rule.lookback_days} onChange={(n) => patch({ lookback_days: n ?? 14 })} />
            <NumField label="Bodyweight min" value={rule.bodyweight_min} onChange={(n) => patch({ bodyweight_min: n })} />
            <NumField label="Bodyweight max" value={rule.bodyweight_max} onChange={(n) => patch({ bodyweight_max: n })} />
            <NumField label="Training age min" value={rule.training_age_min} onChange={(n) => patch({ training_age_min: n })} />
            <NumField label="Training age max" value={rule.training_age_max} onChange={(n) => patch({ training_age_max: n })} />
          </div>

          {/* Class year */}
          <Input
            label="Class years (comma-sep grad years)"
            placeholder="e.g. 2027, 2028"
            value={(rule.grad_years ?? []).join(', ')}
            onChange={(e) => {
              const years = e.target.value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
              patch({ grad_years: years.length ? years : undefined });
            }}
          />

          {/* Lift completion */}
          <Checkbox
            label="Only athletes with an incomplete lift in the window"
            checked={rule.lift_completion === 'incomplete'}
            onChange={(e) => patch({ lift_completion: (e.target as HTMLInputElement).checked ? 'incomplete' : undefined })}
          />

          {/* Live preview */}
          <div className="rounded-xl border border-warm-100 bg-cream-100/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-warm-400">Live preview</span>
              <span className="text-xs font-medium text-warm-600">
                {previewing ? 'Evaluating…' : preview ? `${preview.matches.length} match` : '—'}
              </span>
            </div>
            {preview?.empty ? (
              <p className="mt-2 text-xs text-warm-400">Add at least one rule to preview matched athletes.</p>
            ) : preview && preview.matches.length > 0 ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {preview.matches.map((m) => (
                  <li key={m.player_id} className="flex items-center gap-1.5 text-xs text-warm-700">
                    <IconCheck size={13} className="shrink-0 text-primary-600" />
                    <span className="truncate" title={m.reasons.join('; ')}>{m.reasons[0] ?? 'Matched'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-warm-400">No athletes match this rule yet.</p>
            )}
          </div>

          {msg && (
            <p
              role="status"
              aria-live="polite"
              className={`text-xs font-medium ${msg.tone === 'error' ? 'text-red-600' : 'text-primary-700'}`}
            >
              {msg.text}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" leftIcon={<IconTrash size={14} />} onClick={() => setConfirmDelete(true)} disabled={saving}>
              Archive
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving} disabled={Boolean(preview?.empty)}>
              Save &amp; recompute
            </Button>
          </div>
        </>
      )}

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Archive group?">
        <div className="space-y-4">
          <p className="text-sm text-warm-600">
            Archiving <strong>{group.name}</strong> hides it from the room. Membership and history are kept —
            nothing is deleted.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} isLoading={saving}>Archive group</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function NumField({
  label, value, onChange,
}: { label: string; value: number | null | undefined; onChange: (n: number | undefined) => void }) {
  return (
    <Input
      label={label}
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? undefined : Number(v));
      }}
    />
  );
}
