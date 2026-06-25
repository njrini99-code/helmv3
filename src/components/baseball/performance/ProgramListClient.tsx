'use client';

// =============================================================================
// src/components/baseball/performance/ProgramListClient.tsx
//
// V11 Program list (spec L25 + Packet E). Hand-composed for the strength coach's
// primary task here: SCAN existing programs and START a new one. Not a generic
// grid — programs are grouped by lifecycle (Active first, then Drafts, then
// Templates, then Archived) so the coach's eye lands on what's live, and a single
// prominent "New program" primary action sits in the header.
//
// Cream/green GolfHelm palette only — Card / Button / EmptyState verbatim; status
// uses color PLUS label (spec L568). createLiftProgram is the orphaned action this
// finally wires; on success we route into the editor.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { IconPlus, IconDumbbell } from '@/components/icons';
import { createLiftProgram } from '@/app/baseball/actions/lifting-v11';
import type { LiftProgramListItem } from '@/lib/baseball/read-models/lift-programs';
import type {
  BaseballLiftProgramPhase,
  BaseballLiftProgramGoal,
  BaseballLiftProgramStatus,
} from '@/lib/types/baseball-lifting-v11';

const PHASE_OPTIONS: Array<{ value: BaseballLiftProgramPhase; label: string }> = [
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
  { value: 'preseason', label: 'Preseason' },
  { value: 'in_season', label: 'In-season' },
  { value: 'postseason', label: 'Postseason' },
  { value: 'summer', label: 'Summer' },
  { value: 'return_to_play', label: 'Return to play' },
  { value: 'testing', label: 'Testing' },
];
const GOAL_OPTIONS: Array<{ value: BaseballLiftProgramGoal; label: string }> = [
  { value: 'strength', label: 'Strength' },
  { value: 'power', label: 'Power' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'speed', label: 'Speed' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'arm_care', label: 'Arm care' },
  { value: 'testing', label: 'Testing' },
];

const PHASE_LABEL = Object.fromEntries(PHASE_OPTIONS.map((o) => [o.value, o.label]));
const GOAL_LABEL = Object.fromEntries(GOAL_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_META: Record<BaseballLiftProgramStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  draft: { label: 'Draft', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  archived: { label: 'Archived', cls: 'bg-warm-100 text-warm-500 border-warm-200' },
};

function StatusChip({ status, template }: { status: BaseballLiftProgramStatus; template: boolean }) {
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

function ProgramCard({ program }: { program: LiftProgramListItem }) {
  return (
    <Link
      href={`/baseball/dashboard/performance/programs/${program.id}`}
      className="group block rounded-2xl border border-warm-100 bg-white/70 p-4 transition-all hover:border-primary-200 hover:bg-white hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-warm-900 group-hover:text-primary-700">
          {program.name}
        </h3>
        <StatusChip status={program.status} template={program.is_template} />
      </div>
      {program.description && (
        <p className="mt-1 line-clamp-2 text-sm text-warm-500">{program.description}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
        <span className="font-medium text-warm-700">{PHASE_LABEL[program.phase] ?? program.phase}</span>
        <span aria-hidden>·</span>
        <span>{GOAL_LABEL[program.goal] ?? program.goal}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{program.week_count} {program.week_count === 1 ? 'week' : 'weeks'}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{program.day_count} {program.day_count === 1 ? 'day' : 'days'}</span>
      </div>
    </Link>
  );
}

function Group({ title, items }: { title: string; items: LiftProgramListItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-400">
        {title} <span className="tabular-nums text-warm-300">({items.length})</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => <ProgramCard key={p.id} program={p} />)}
      </div>
    </section>
  );
}

interface Props {
  programs: LiftProgramListItem[];
}

export function ProgramListClient({ programs }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<BaseballLiftProgramPhase>('in_season');
  const [goal, setGoal] = useState<BaseballLiftProgramGoal>('strength');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();

  const grouped = useMemo(() => {
    const active = programs.filter((p) => p.status === 'active' && !p.is_template);
    const drafts = programs.filter((p) => p.status === 'draft' && !p.is_template);
    const templates = programs.filter((p) => p.is_template);
    const archived = programs.filter((p) => p.status === 'archived' && !p.is_template);
    return { active, drafts, templates, archived };
  }, [programs]);

  function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the program a name.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await createLiftProgram({
          name: trimmed,
          description: description.trim() || null,
          phase,
          goal,
        });
        if (res.success && res.id) {
          setOpen(false);
          router.push(`/baseball/dashboard/performance/programs/${res.id}`);
        } else {
          setError(res.error ?? 'Could not create the program.');
        }
      } catch {
        setError('Could not create the program. Please try again.');
      }
    });
  }

  return (
    <motion.div
      className="space-y-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-warm-400">
            <Link href="/baseball/dashboard/performance" className="hover:text-primary-700">
              Performance
            </Link>
            <span aria-hidden>/</span>
            <span className="text-warm-600">Programs</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-warm-900">Training programs</h1>
          <p className="text-sm text-warm-500">
            Build macrocycles, weeks, and lift days. Publish a day to materialize the weight-room board.
          </p>
        </div>
        <Button variant="primary" leftIcon={<IconPlus size={16} />} onClick={() => setOpen(true)}>
          New program
        </Button>
      </div>

      {programs.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<IconDumbbell size={40} />}
              title="No programs yet"
              description="Create your first training program, add weeks and lift days, then publish a day to put it on the weight-room board."
              action={{ label: 'Create a program', onClick: () => setOpen(true) }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Group title="Active" items={grouped.active} />
          <Group title="Drafts" items={grouped.drafts} />
          <Group title="Templates" items={grouped.templates} />
          <Group title="Archived" items={grouped.archived} />
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="New training program">
        <div className="space-y-4">
          <Input
            label="Program name"
            placeholder="e.g. Winter Strength Block"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
          />
          <Textarea
            label="Description (optional)"
            placeholder="Goal of this block, who it's for, key emphases…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Phase"
              options={PHASE_OPTIONS}
              value={phase}
              onChange={(v) => setPhase(v as BaseballLiftProgramPhase)}
            />
            <Select
              label="Primary goal"
              options={GOAL_OPTIONS}
              value={goal}
              onChange={(v) => setGoal(v as BaseballLiftProgramGoal)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} isLoading={pending}>
              Create &amp; open editor
            </Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
