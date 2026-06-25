'use client';

// =============================================================================
// src/components/lifting/programs/ProgramListClient.tsx
//
// Helm Lifting Lab — program list. Native Lab UI consuming HelmLifting* types
// directly (no baseball adapter). Grouped by lifecycle: Active → Draft →
// Template → Archived. One prominent "New program" primary action in the header.
// Cream/green palette; Card / Button / EmptyState / Modal verbatim.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { IconPlus, IconDumbbell } from '@/components/icons';
import { createProgram } from '@/app/lifting/actions/programs';
import type {
  HelmLiftingProgramRow,
  HelmLiftingProgramPhase,
  HelmLiftingProgramGoal,
  HelmLiftingProgramStatus,
} from '@/lib/types/helm-lifting-data';

interface ProgramWithCounts extends HelmLiftingProgramRow {
  week_count: number;
  day_count: number;
}

interface Props {
  programs: ProgramWithCounts[];
  orgId: string;
  canEdit: boolean;
}

const PHASE_OPTIONS: Array<{ value: HelmLiftingProgramPhase; label: string }> = [
  { value: 'fall', label: 'Fall' }, { value: 'winter', label: 'Winter' },
  { value: 'preseason', label: 'Preseason' }, { value: 'in_season', label: 'In-season' },
  { value: 'postseason', label: 'Postseason' }, { value: 'summer', label: 'Summer' },
  { value: 'return_to_play', label: 'Return to play' }, { value: 'testing', label: 'Testing' },
];

const GOAL_OPTIONS: Array<{ value: HelmLiftingProgramGoal; label: string }> = [
  { value: 'strength', label: 'Strength' }, { value: 'power', label: 'Power' },
  { value: 'hypertrophy', label: 'Hypertrophy' }, { value: 'speed', label: 'Speed' },
  { value: 'maintenance', label: 'Maintenance' }, { value: 'recovery', label: 'Recovery' },
  { value: 'arm_care', label: 'Arm care' }, { value: 'testing', label: 'Testing' },
];

const PHASE_LABEL = Object.fromEntries(PHASE_OPTIONS.map((o) => [o.value, o.label]));
const GOAL_LABEL = Object.fromEntries(GOAL_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_META: Record<HelmLiftingProgramStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  draft: { label: 'Draft', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  archived: { label: 'Archived', cls: 'bg-warm-100 text-warm-500 border-warm-200' },
};

function StatusChip({ status, template }: { status: HelmLiftingProgramStatus; template: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
        {meta.label}
      </span>
      {template && (
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Template
        </span>
      )}
    </span>
  );
}

export function ProgramListClient({ programs, orgId, canEdit }: Props) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<HelmLiftingProgramPhase>('preseason');
  const [goal, setGoal] = useState<HelmLiftingProgramGoal>('strength');
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return programs;
    return programs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        PHASE_LABEL[p.phase]?.toLowerCase().includes(q) ||
        GOAL_LABEL[p.goal]?.toLowerCase().includes(q),
    );
  }, [programs, search]);

  const grouped = useMemo(() => {
    const active = filtered.filter((p) => p.status === 'active' && !p.is_template);
    const templates = filtered.filter((p) => p.is_template);
    const drafts = filtered.filter((p) => p.status === 'draft' && !p.is_template);
    const archived = filtered.filter((p) => p.status === 'archived' && !p.is_template);
    return { active, templates, drafts, archived };
  }, [filtered]);

  function handleCreate() {
    if (!name.trim()) { setCreateError('Name is required.'); return; }
    setCreateError(null);
    startTransition(async () => {
      const result = await createProgram({ orgId, name: name.trim(), description: description.trim() || null, phase, goal });
      if (result.success && result.id) {
        setShowCreate(false);
        setName('');
        setDescription('');
        router.push(`/lifting/dashboard/programs/${result.id}`);
      } else {
        setCreateError(result.error ?? 'Failed to create program.');
      }
    });
  }

  const ProgramCard = ({ program }: { program: ProgramWithCounts }) => (
    <motion.div
      layout
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={`/lifting/dashboard/programs/${program.id}`}>
        <Card variant="interactive" className="group cursor-pointer p-0 overflow-hidden">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-warm-900 group-hover:text-primary-700 transition-colors line-clamp-2">
                {program.name}
              </p>
              <StatusChip status={program.status} template={program.is_template} />
            </div>
            <div className="flex items-center gap-3 text-xs text-warm-500">
              <span>{PHASE_LABEL[program.phase] ?? program.phase}</span>
              <span>·</span>
              <span>{GOAL_LABEL[program.goal] ?? program.goal}</span>
              <span>·</span>
              <span>{program.week_count}w / {program.day_count}d</span>
            </div>
            {program.description && (
              <p className="text-sm text-warm-500 line-clamp-2">{program.description}</p>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );

  const Section = ({ title, items }: { title: string; items: ProgramWithCounts[] }) => {
    if (items.length === 0) return null;
    return (
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-warm-400">{title}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => <ProgramCard key={p.id} program={p} />)}
        </div>
      </section>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-warm-900">Programs</h1>
          <p className="mt-0.5 text-sm text-warm-500">
            {programs.length} program{programs.length !== 1 ? 's' : ''} in this org
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-60">
            <Input
              placeholder="Search programs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button onClick={() => setShowCreate(true)} className="gap-1.5">
              <IconPlus size={15} /> New program
            </Button>
          )}
        </div>
      </div>

      {/* Grouped list */}
      {programs.length === 0 ? (
        <EmptyState
          icon={<IconDumbbell size={28} className="text-warm-300" />}
          title="No programs yet"
          description={canEdit ? 'Create your first lifting program to get started.' : 'No programs have been created yet.'}
          action={
            canEdit ? (
              <Button onClick={() => setShowCreate(true)} className="gap-1.5">
                <IconPlus size={15} /> New program
              </Button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching programs"
          description={`No programs match "${search}". Try a different search.`}
        />
      ) : (
        <div className="space-y-8">
          <Section title="Active" items={grouped.active} />
          <Section title="Templates" items={grouped.templates} />
          <Section title="Drafts" items={grouped.drafts} />
          <Section title="Archived" items={grouped.archived} />
        </div>
      )}

      {/* Create modal */}
      {canEdit && (
        <Modal
          open={showCreate}
          onClose={() => { setShowCreate(false); setCreateError(null); }}
          title="New program"
        >
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fall Strength Block"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional overview…"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Phase</label>
                <NativeSelect
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as HelmLiftingProgramPhase)}
                >
                  {PHASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Goal</label>
                <NativeSelect
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as HelmLiftingProgramGoal)}
                >
                  {GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
            </div>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
                {isPending ? 'Creating…' : 'Create program'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
