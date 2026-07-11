'use client';

/**
 * ============================================================================
 * RosterMemberActions — the roster row's write surface.
 * ----------------------------------------------------------------------------
 * Closes three confirmed feature-sweep gaps on top of RosterFairway (which
 * stays presentation-only): removePlayerFromTeam / assignPlayerToTeam /
 * approvePendingMember / rejectPendingMember all existed as real, capability-
 * gated server actions with NO reachable UI. RosterClient owns the actual
 * mutation calls + toasts (matching its existing onSaveLineup pattern); these
 * components only own their own popover/modal-open + form-local state and
 * call back into RosterClient via props.
 *
 *   • PendingMemberActions — Approve / Decline for the Status board's
 *     "Awaiting Join" column (the pending-joiner gap — every new joiner
 *     defaults to status='pending' and had no coach control to clear it).
 *   • RosterRowMenu — kebab menu on the roster wall row: Edit jersey/position
 *     (assignPlayerToTeam upsert) + Remove from team (removePlayerFromTeam).
 *   • AssignPlayerModal — "Add existing player": search by name/email, then
 *     assignPlayerToTeam for a mid-season transfer / manual add.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { Select, Input, Button as FairwayButton, IconButton, PopoverPanel, ModalShell, SearchField } from '@/components/fairway';
import { IconMoreVertical, IconEdit, IconTrash, IconCheck, IconX } from '@/components/icons';
import type { AssignablePlayerResult } from '@/app/baseball/actions/roster';
import { POSITIONS } from './roster-constants';

export type RosterActionOutcome = { success: boolean; error?: string };

/** Parse a jersey-number input field into a validated `number | null`. */
function parseJersey(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 99 || !Number.isInteger(n)) {
    return { value: null, error: 'Enter a jersey number between 0 and 99.' };
  }
  return { value: n };
}

// ── Pending row — Approve / Decline ─────────────────────────────────────────

export function PendingMemberActions({
  memberId,
  playerName,
  onApprove,
  onReject,
}: {
  memberId: string;
  playerName: string;
  onApprove: (memberId: string) => Promise<RosterActionOutcome>;
  onReject: (memberId: string) => Promise<RosterActionOutcome>;
}) {
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);

  async function handle(kind: 'approve' | 'reject') {
    if (pending) return;
    setPending(kind);
    try {
      await (kind === 'approve' ? onApprove(memberId) : onReject(memberId));
    } finally {
      setPending(null);
    }
  }

  return (
    // Rendered as a SIBLING of the row's <PlayerRowPlate> (not nested inside
    // it), so these buttons never bubble into the row's own onClick-to-profile
    // navigation — no stopPropagation needed.
    <div className="flex shrink-0 items-center gap-1.5">
      <FairwayButton
        variant="secondary"
        size="sm"
        busy={pending === 'approve'}
        disabled={pending !== null}
        onClick={() => handle('approve')}
        aria-label={`Approve ${playerName}'s join request`}
      >
        <IconCheck size={14} className="mr-1" />
        Approve
      </FairwayButton>
      <FairwayButton
        variant="ghost"
        size="sm"
        busy={pending === 'reject'}
        disabled={pending !== null}
        onClick={() => handle('reject')}
        aria-label={`Decline ${playerName}'s join request`}
        className="text-fw-danger hover:bg-fw-danger-bg hover:text-fw-danger"
      >
        <IconX size={14} className="mr-1" />
        Decline
      </FairwayButton>
    </div>
  );
}

// ── Roster wall row — Edit jersey/position + Remove from team ─────────────

const POSITION_SELECT_OPTIONS = [
  { value: 'none', label: 'No position set' },
  ...POSITIONS.map((p) => ({ value: p, label: p })),
];

export function RosterRowMenu({
  playerId,
  playerName,
  jerseyNumber,
  position,
  onAssign,
  onRemove,
}: {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  position: string | null;
  onAssign: (input: {
    playerId: string;
    jerseyNumber: number | null;
    position: string | null;
  }) => Promise<RosterActionOutcome>;
  onRemove: (playerId: string, playerName: string) => Promise<RosterActionOutcome>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [jerseyValue, setJerseyValue] = useState(jerseyNumber != null ? String(jerseyNumber) : '');
  const [positionValue, setPositionValue] = useState(position ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setMenuOpen(false);
    setJerseyValue(jerseyNumber != null ? String(jerseyNumber) : '');
    setPositionValue(position ?? '');
    setError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    const parsed = parseJersey(jerseyValue);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onAssign({
      playerId,
      jerseyNumber: parsed.value,
      position: positionValue || null,
    });
    setSaving(false);
    if (result.success) {
      setEditOpen(false);
    } else {
      setError(result.error ?? 'Failed to update player.');
    }
  }

  async function handleRemove() {
    setRemoving(true);
    const result = await onRemove(playerId, playerName);
    setRemoving(false);
    if (result.success) {
      setRemoveOpen(false);
    }
    // Failure is toasted by the caller — the modal simply stays open so the
    // coach can retry or cancel.
  }

  return (
    // Rendered as a SIBLING of the row's <PlayerRowPlate> (not nested inside
    // it), so this menu never bubbles into the row's own onClick-to-profile
    // navigation — no stopPropagation needed.
    <div className="shrink-0">
      <PopoverPanel
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="bottom"
        align="end"
        surface="matte"
        width="sm"
        ariaLabel={`Actions for ${playerName}`}
        trigger={
          <IconButton variant="ghost" size="md" aria-label={`Actions for ${playerName}`}>
            <IconMoreVertical size={16} />
          </IconButton>
        }
      >
        <PopoverPanel.Item onClick={openEdit}>
          <IconEdit size={16} className="text-text-tertiary" />
          Edit jersey / position
        </PopoverPanel.Item>
        <PopoverPanel.Separator />
        <PopoverPanel.Item
          onClick={() => {
            setMenuOpen(false);
            setRemoveOpen(true);
          }}
          className="text-fw-danger hover:bg-fw-danger-bg hover:text-fw-danger"
        >
          <IconTrash size={16} className="text-fw-danger" />
          Remove from team
        </PopoverPanel.Item>
      </PopoverPanel>

      {/* ---- EDIT JERSEY / POSITION ---- */}
      <ModalShell
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setError(null);
        }}
        size="sm"
        title="Edit jersey & position"
        description={`Update ${playerName}'s roster details.`}
      >
        <ModalShell.Body>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="roster-edit-jersey" className="mb-1.5 block font-fw-sans text-body-sm text-text-secondary">
                Jersey number
              </label>
              <Input
                id="roster-edit-jersey"
                type="number"
                min={0}
                max={99}
                value={jerseyValue}
                onChange={(e) => setJerseyValue(e.target.value)}
                disabled={saving}
                placeholder="e.g. 24"
              />
            </div>
            <div>
              <label htmlFor="roster-edit-position" className="mb-1.5 block font-fw-sans text-body-sm text-text-secondary">
                Position
              </label>
              <Select
                size="md"
                aria-label="Position"
                value={positionValue || 'none'}
                onValueChange={(v) => setPositionValue(v === 'none' ? '' : (v ?? ''))}
                options={POSITION_SELECT_OPTIONS}
              />
            </div>
            {error ? <p className="font-fw-sans text-caption text-fw-danger">{error}</p> : null}
          </div>
        </ModalShell.Body>
        <ModalShell.Footer>
          <FairwayButton variant="ghost" onClick={() => setEditOpen(false)} disabled={saving}>
            Cancel
          </FairwayButton>
          <FairwayButton variant="primary" busy={saving} onClick={handleSaveEdit}>
            Save
          </FairwayButton>
        </ModalShell.Footer>
      </ModalShell>

      {/* ---- REMOVE FROM TEAM (destructive membership-only delete) ---- */}
      <ModalShell
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        size="sm"
        title="Remove player?"
        description={`Remove ${playerName} from your team? They can rejoin later using the team invite link.`}
      >
        <ModalShell.Body>
          <p className="rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3 font-fw-sans text-body-sm text-text-secondary">
            Their account and stats will <span className="font-medium text-text-primary">not</span> be
            deleted — this only removes them from your active roster.
          </p>
        </ModalShell.Body>
        <ModalShell.Footer>
          <FairwayButton variant="ghost" onClick={() => setRemoveOpen(false)} disabled={removing}>
            Cancel
          </FairwayButton>
          <FairwayButton variant="danger" busy={removing} onClick={handleRemove}>
            Remove player
          </FairwayButton>
        </ModalShell.Footer>
      </ModalShell>
    </div>
  );
}

// ── Add existing player (mid-season transfer / manual add) ─────────────────

export function AssignPlayerModal({
  open,
  onClose,
  onSearch,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<{ success: boolean; data?: AssignablePlayerResult[]; error?: string }>;
  onAssign: (input: {
    playerId: string;
    jerseyNumber: number | null;
    position: string | null;
  }) => Promise<RosterActionOutcome>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignablePlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssignablePlayerResult | null>(null);
  const [jerseyValue, setJerseyValue] = useState('');
  const [positionValue, setPositionValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const result = await onSearch(q);
      setSearching(false);
      if (result.success) {
        setResults(result.data ?? []);
        setSearchError(null);
      } else {
        setResults([]);
        setSearchError(result.error ?? 'Search failed. Please try again.');
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  function reset() {
    setQuery('');
    setResults([]);
    setSelected(null);
    setJerseyValue('');
    setPositionValue('');
    setSaveError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm() {
    if (!selected) return;
    const parsed = parseJersey(jerseyValue);
    if (parsed.error) {
      setSaveError(parsed.error);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await onAssign({
      playerId: selected.id,
      jerseyNumber: parsed.value,
      position: positionValue || null,
    });
    setSaving(false);
    if (result.success) {
      handleClose();
    } else {
      setSaveError(result.error ?? 'Failed to add player.');
    }
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      size="md"
      title="Add existing player"
      description="Search for a player who already has an account — useful for a mid-season transfer or a manual add."
    >
      <ModalShell.Body>
        {!selected ? (
          <div className="flex flex-col gap-3">
            <SearchField
              size="md"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              loading={searching}
              placeholder="Search by name or email"
              aria-label="Search players"
            />
            {searchError ? (
              <p className="font-fw-sans text-body-sm text-fw-danger">{searchError}</p>
            ) : !searching && query.trim().length >= 2 && results.length === 0 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">No matching players found.</p>
            ) : query.trim().length > 0 && query.trim().length < 2 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">Keep typing to search.</p>
            ) : null}
            {results.length > 0 ? (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    {/* eslint-disable-next-line helm/no-raw-button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(p);
                        setJerseyValue('');
                        setPositionValue(p.primary_position ?? '');
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-fw-md border border-border-subtle bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                        {[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed player'}
                      </span>
                      <span className="font-fw-sans text-caption text-text-tertiary">
                        {[p.email, p.primary_position, p.grad_year ? String(p.grad_year) : null]
                          .filter(Boolean)
                          .join(' · ') || 'No additional details'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3">
              <p className="font-fw-sans text-body-sm font-medium text-text-primary">
                {[selected.first_name, selected.last_name].filter(Boolean).join(' ') || 'Unnamed player'}
              </p>
              {selected.email ? (
                <p className="font-fw-sans text-caption text-text-tertiary">{selected.email}</p>
              ) : null}
              {/* eslint-disable-next-line helm/no-raw-button */}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mt-1 font-fw-sans text-caption text-accent-600 underline-offset-2 hover:underline"
              >
                Choose someone else
              </button>
            </div>
            <div>
              <label htmlFor="assign-jersey" className="mb-1.5 block font-fw-sans text-body-sm text-text-secondary">
                Jersey number
              </label>
              <Input
                id="assign-jersey"
                type="number"
                min={0}
                max={99}
                value={jerseyValue}
                onChange={(e) => setJerseyValue(e.target.value)}
                disabled={saving}
                placeholder="e.g. 24"
              />
            </div>
            <div>
              <label htmlFor="assign-position" className="mb-1.5 block font-fw-sans text-body-sm text-text-secondary">
                Position
              </label>
              <Select
                size="md"
                aria-label="Position"
                value={positionValue || 'none'}
                onValueChange={(v) => setPositionValue(v === 'none' ? '' : (v ?? ''))}
                options={POSITION_SELECT_OPTIONS}
              />
            </div>
            {saveError ? <p className="font-fw-sans text-caption text-fw-danger">{saveError}</p> : null}
          </div>
        )}
      </ModalShell.Body>
      <ModalShell.Footer>
        <FairwayButton variant="ghost" onClick={handleClose} disabled={saving}>
          Cancel
        </FairwayButton>
        {selected ? (
          <FairwayButton variant="primary" busy={saving} onClick={handleConfirm}>
            Add to roster
          </FairwayButton>
        ) : null}
      </ModalShell.Footer>
    </ModalShell>
  );
}
