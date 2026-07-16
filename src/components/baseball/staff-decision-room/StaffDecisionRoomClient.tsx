'use client';

// =============================================================================
// src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx
//
// Staff Decision Room — a DECISION WORKSPACE (V10 Packet 10 "Staff Decision
// Room / Decision Ledger / Staff Action Queue", V5 System 5 "Staff Meeting
// Prep"). NOT a read-only insight list.
//
// PRIMARY TASK: drive open, source-backed agenda items to decisions in a
// meeting. Meeting Mode (the default): agenda on the LEFT, the selected
// item's source-backed detail + ACTION BAR on the RIGHT. Conversions (task /
// note / practice block) reuse the signal→action engine so the real
// subsystem object is materialized — they are not fake buttons. The Decision
// Ledger is a real record of decisions MADE, threaded to evidence.
//
// All mutations are server actions (capability-gated on can_manage_settings,
// same as the read). RLS guarantees this surface is staff-only; players never
// reach it.
//
// P4.23 (Living-Annual migration): this component is now a thin CONTAINER —
// it owns the root-level state (agenda selection, the "new agenda item"
// inline form, export, refresh, the outcome re-measure sweep) and delegates
// ALL presentation to `<StaffDecisionRoomFairway>` (the same "computed state
// + handlers" split used by the other migrated baseball surfaces, e.g.
// AnnouncementsFairway/TasksFairway). Every per-item mutation (mark
// discussed/resolve/reopen/record a decision note/convert a signal) still
// lives exactly where it did before — inside the agenda detail pane, now
// rendered by the Fairway component — so `actions/decision-room.ts` and
// `actions/signals.ts` (read-only import, never edited) are called from the
// exact same places, just re-skinned.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/sonner';

import { createMeetingItem, type DecisionRoomData } from '@/app/baseball/actions/decision-room';
import { recordActionOutcomes } from '@/app/baseball/actions/coachhelm-actions';
import { StaffDecisionRoomFairway } from './StaffDecisionRoomFairway';

interface StaffDecisionRoomClientProps {
  data: DecisionRoomData;
}

export function StaffDecisionRoomClient({ data }: StaffDecisionRoomClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Selected agenda item drives the meeting-mode detail pane. Default to the
  // hottest open item (agenda is already severity-sorted server-side).
  const firstAgenda = data.agenda[0] ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(
    firstAgenda ? `${firstAgenda.kind}-${firstAgenda.id}` : null,
  );

  const selected = useMemo(
    () =>
      data.agenda.find((i) => `${i.kind}-${i.id}` === selectedKey) ??
      data.agenda[0] ??
      null,
    [data.agenda, selectedKey],
  );

  // ---- "New agenda item" inline form state ----------------------------------
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDetail, setNewItemDetail] = useState('');
  const [creatingItem, startCreateItem] = useTransition();

  function toggleNewItem() {
    setNewItemOpen((v) => !v);
    setNewItemTitle('');
    setNewItemDetail('');
  }

  function submitNewItem() {
    const title = newItemTitle.trim();
    if (!title) return;
    startCreateItem(async () => {
      try {
        const res = await createMeetingItem({
          title,
          detail: newItemDetail.trim() || null,
        });
        if (res.success) {
          toast.success('Agenda item added', title);
          setNewItemOpen(false);
          setNewItemTitle('');
          setNewItemDetail('');
          refresh();
        } else {
          toast.error('Could not add item', res.error ?? 'Please try again.');
        }
      } catch {
        toast.error('Something went wrong', 'Please try again.');
      }
    });
  }

  // ---- Export: a plain-text meeting summary built from real decisions -------
  function exportSummary() {
    const lines: string[] = [];
    lines.push('STAFF DECISION ROOM — MEETING SUMMARY');
    lines.push(new Date().toLocaleString());
    lines.push('');
    lines.push(`Open agenda items: ${data.openAgendaCount}`);
    lines.push(`Decisions recorded: ${data.decisionCount}`);
    lines.push('');
    lines.push('AGENDA');
    if (data.agenda.length === 0) lines.push('  (empty)');
    data.agenda.forEach((i, n) => {
      const sev = i.severityHint ? `[${i.severityHint}] ` : '';
      const who = i.playerName ? ` — ${i.playerName}` : '';
      const st = i.status === 'discussed' ? ' (discussed)' : '';
      lines.push(`  ${n + 1}. ${sev}${i.title}${who}${st}`);
      if (i.detail) lines.push(`     ${i.detail}`);
    });
    lines.push('');
    lines.push('PLAYERS TO DISCUSS');
    if (data.playersToDiscuss.length === 0) lines.push('  (none)');
    data.playersToDiscuss.forEach((p) =>
      lines.push(
        `  • ${p.name} — ${p.openCount} open${p.criticalCount ? `, ${p.criticalCount} critical` : ''}`,
      ),
    );
    lines.push('');
    lines.push('WINS / RESULTS (most recent completed games)');
    if (data.recentGameResults.length === 0) lines.push('  (no completed games)');
    data.recentGameResults.forEach((g) => {
      const res = g.result ? g.result.toUpperCase() : '?';
      const score = g.ourScore != null && g.opponentScore != null ? `${g.ourScore}–${g.opponentScore}` : '';
      lines.push(`  [${res}] ${g.opponentName ?? 'Opponent'}${score ? ` ${score}` : ''} (${g.gameDate})`);
    });
    lines.push('');
    lines.push('AVAILABILITY CONCERNS');
    if (data.availabilityConcerns.length === 0) lines.push('  (none)');
    data.availabilityConcerns.forEach((a) =>
      lines.push(`  • ${a.playerName ?? 'Unknown'} — ${a.status}${a.reasonCategory ? ` (${a.reasonCategory})` : ''}`)
    );
    lines.push('');
    lines.push(`PRACTICE ATTENDANCE (last 14 days): ${data.attendanceSummary.totalAttended} present / ${data.attendanceSummary.totalMissed} missed`);
    if (data.attendanceSummary.concernedPlayers.length > 0) {
      data.attendanceSummary.concernedPlayers.forEach((p) =>
        lines.push(`  • ${p.playerName ?? 'Unknown'}: ${p.missedCount} missed`)
      );
    }
    lines.push('');
    lines.push(`LIFT COMPLIANCE (last 14 days): ${data.liftSummary.completedCount}/${data.liftSummary.scheduledCount} sessions completed`);
    if (data.liftSummary.nonCompliantPlayers.length > 0) {
      data.liftSummary.nonCompliantPlayers.forEach((p) =>
        lines.push(`  • ${p.playerName ?? 'Unknown'}: ${p.missedCount} missed`)
      );
    }
    lines.push('');
    lines.push('OPEN TASKS');
    if (data.openTasks.length === 0) lines.push('  (none)');
    data.openTasks.forEach((t) =>
      lines.push(`  • [${t.status}] ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ''}`)
    );
    lines.push('');
    lines.push('ACADEMIC / TRAVEL CONFLICTS');
    if (data.conflicts.length === 0) lines.push('  (none)');
    data.conflicts.forEach((c) =>
      lines.push(`  • [${c.severity}] ${c.playerName ?? 'Unknown'} — ${c.obligationLabel ?? c.obligationKind}`)
    );
    lines.push('');
    lines.push('DECISIONS RECORDED');
    if (data.ledger.length === 0) lines.push('  (none yet)');
    data.ledger.forEach((e) =>
      lines.push(`  • [${e.kind}] ${e.label}${e.detail ? ` — ${e.detail}` : ''}`),
    );
    lines.push('');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-room-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Summary exported', 'A meeting summary was downloaded.');
  }

  // Server actions revalidate the route path; router.refresh() in a transition
  // re-fetches the RSC payload without a hard navigation, keeping the UI snappy.
  const refresh = () => startTransition(() => router.refresh());

  // ---- Re-measure: run the outcome sweep now (the manual "did-it-move" pass) -
  // The sweep also runs nightly (Inngest) + on every postgame review; this gives
  // a coach an on-demand re-read in the room. Capability-gated server-side.
  const [sweeping, startSweep] = useTransition();
  const reMeasureOutcomes = () =>
    startSweep(async () => {
      try {
        const res = await recordActionOutcomes();
        if (res.success) {
          toast.success(
            'Outcomes re-measured',
            res.measured > 0
              ? `${res.measured} action${res.measured === 1 ? '' : 's'} updated.`
              : 'No new data to measure yet.',
          );
          router.refresh();
        } else {
          toast.error('Could not re-measure', res.error);
        }
      } catch {
        toast.error('Something went wrong', 'Please try again.');
      }
    });

  return (
    <StaffDecisionRoomFairway
      data={data}
      selected={selected}
      selectedKey={selectedKey}
      onSelectAgendaItem={setSelectedKey}
      newItemOpen={newItemOpen}
      newItemTitle={newItemTitle}
      newItemDetail={newItemDetail}
      creatingItem={creatingItem}
      onToggleNewItem={toggleNewItem}
      onNewItemTitleChange={setNewItemTitle}
      onNewItemDetailChange={setNewItemDetail}
      onSubmitNewItem={submitNewItem}
      onExportSummary={exportSummary}
      onRefresh={refresh}
      sweeping={sweeping}
      onReMeasureOutcomes={reMeasureOutcomes}
    />
  );
}
