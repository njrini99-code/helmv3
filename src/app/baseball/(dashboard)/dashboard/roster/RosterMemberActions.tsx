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
 *   • AssignPlayerModal — "Add existing player": find a player by name (only
 *     ever players this coach can already see) or by their exact, whole email
 *     address (the cross-program mid-season-transfer path), then
 *     assignPlayerToTeam. The email half is exact-match by design — see
 *     searchAssignablePlayers in src/app/baseball/actions/roster.ts — so the
 *     copy in this modal has to teach that, or a coach who types "smith",
 *     gets nothing, and knows the player is out there just concludes the
 *     feature is broken.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { SearchX } from 'lucide-react';
import { Select, Input, Button as FairwayButton, IconButton, PopoverPanel, ModalShell, SearchField, EmptyState, InlineNotice } from '@/components/fairway';
import { IconMoreVertical, IconEdit, IconTrash, IconCheck, IconX } from '@/components/icons';
import type { AssignablePlayerLookup, AssignablePlayerResult } from '@/app/baseball/actions/roster';
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
    //
    // ICON-ONLY, ALWAYS (#roster-pending-actions-clip): this only ever renders
    // inside the Status board's "Awaiting Join" TriageColumn — a PaperCard
    // that's ~360-400px wide at EVERY breakpoint (TriageBoard adds more
    // same-width grid columns as the viewport grows rather than widening a
    // single card; see roster-wall-stats.ts's buildBoardStats comment). Two
    // labeled buttons ("Approve" + "Decline", each with an icon) cost ~200px
    // combined — leaving no width for PlayerRowPlate's `min-w-[64px]` name
    // floor even with its stat column zeroed out (`buildPendingBoardStats`),
    // so the row overflowed PaperCard's `overflow-hidden` and risked clipping
    // these very buttons for a real pending join request (functional-access
    // regression, not cosmetic). Two 44px IconButtons + a 6px gap cost ~94px
    // instead — a `sm:` viewport breakpoint would be dishonest here since the
    // card never actually widens past ~400px even on desktop, so there is no
    // "wide" state where full text would ever paint. aria-label carries the
    // full "Approve/Decline {name}'s join request" text for a11y — same
    // icon-only-with-aria-label pattern as the sibling RosterRowMenu kebab.
    <div className="flex shrink-0 items-center gap-1.5">
      <IconButton
        variant="secondary"
        size="md"
        busy={pending === 'approve'}
        disabled={pending !== null}
        onClick={() => handle('approve')}
        aria-label={`Approve ${playerName}'s join request`}
      >
        <IconCheck size={18} />
      </IconButton>
      <IconButton
        variant="ghost"
        size="md"
        busy={pending === 'reject'}
        disabled={pending !== null}
        onClick={() => handle('reject')}
        aria-label={`Decline ${playerName}'s join request`}
        className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
      >
        <IconX size={18} />
      </IconButton>
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
          className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
        >
          <IconTrash size={16} className="text-fw-danger-ink" />
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
            {error ? <p className="font-fw-sans text-caption text-fw-danger-ink">{error}</p> : null}
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

/**
 * The one line of detail shown under a candidate's name. Position and class
 * year are all we get and all we need: the email path already matched a unique
 * address, and the name path only ever surfaces players this coach can see, so
 * these two are enough to tell two same-named players apart. The lookup
 * deliberately does not return contact details, so there is nothing here that
 * could be blank-but-labelled.
 */
function playerDetailLine(p: AssignablePlayerResult): string {
  const parts = [p.primary_position, p.grad_year ? `Class of ${p.grad_year}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No position or class year on file';
}

export function AssignPlayerModal({
  open,
  onClose,
  onSearch,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<{
    success: boolean;
    data?: AssignablePlayerResult[];
    lookup?: AssignablePlayerLookup;
    exactEmailMatchId?: string | null;
    alreadyOnRoster?: number;
    error?: string;
  }>;
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
  // What the server actually did, carried back with the response rather than
  // re-derived from `query` here. `query` has already moved on by the time a
  // slow response lands, and the server sanitizes the string before it decides
  // which lookup to run — so a client-side guess could disagree with what was
  // really searched and put the wrong explanation under an empty list.
  // `exactEmailMatchId` names the one row (if any) that came from the exact-
  // email lookup, so the two paths stay visibly distinct in a mixed list.
  const [searched, setSearched] = useState<{
    term: string;
    lookup: AssignablePlayerLookup;
    exactEmailMatchId: string | null;
    // Matches the server found and withheld because they are already on this
    // roster. An empty list with this non-zero is a completely different fact
    // from an empty list with it zero, and the two must not share copy.
    alreadyOnRoster: number;
  } | null>(null);
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
      setSearched(null);
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
        setSearched({
          term: q,
          lookup: result.lookup ?? 'name',
          exactEmailMatchId: result.exactEmailMatchId ?? null,
          alreadyOnRoster: result.alreadyOnRoster ?? 0,
        });
      } else {
        setResults([]);
        setSearchError(result.error ?? 'Search failed. Please try again.');
        setSearched(null);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  function reset() {
    setQuery('');
    setResults([]);
    setSearched(null);
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
      description="Add someone who already has a Helm account. Players you can see — your own program, and recruits you have access to — come up by name. Anyone else, including a transfer from another program, has to be looked up by their exact email address."
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
              placeholder="Name, or a full email address"
              aria-label="Find a player by name or exact email address"
            />
            {searchError ? (
              <InlineNotice tone="danger" title="Search failed">
                {searchError}
              </InlineNotice>
            ) : !searching && searched && results.length === 0 ? (
              // Two different failures that a single "No results" would blur
              // into one. An exact-email miss is a fact about the world (no
              // such account); a name miss is a fact about this coach's reach,
              // and the recovery is a different search, not a different spelling.
              // The searched term goes in the DESCRIPTION, never the title: an
              // email address is one long unbreakable token, and EmptyState's
              // title has no wrapping affordance to survive it in a modal this
              // narrow. `break-all` on the echoed term does the rest.
              searched.alreadyOnRoster > 0 ? (
                // The search DID find them — and correctly refused to offer a
                // player who is already here. Falling through to either message
                // below would tell a coach that someone sitting on their own
                // roster does not exist, and (on the email path) send them off
                // to issue an invite for a player they already have.
                <EmptyState
                  variant="subtle"
                  icon={SearchX}
                  title={
                    searched.alreadyOnRoster === 1
                      ? 'They are already on this roster'
                      : 'Everyone matching is already on this roster'
                  }
                  description={
                    <>
                      {searched.alreadyOnRoster === 1 ? 'The player' : 'Every player'} matching{' '}
                      <span className="break-all font-medium text-text-primary">
                        {searched.term}
                      </span>{' '}
                      is already a member of this team, so there is nothing to add. Find them in the
                      roster list to change their number or position — or, if they were cut,
                      reactivate them there.
                    </>
                  }
                />
              ) : searched.lookup === 'email' ? (
                <EmptyState
                  variant="subtle"
                  icon={SearchX}
                  title="No account uses that address"
                  description={
                    <>
                      Nothing matches{' '}
                      <span className="break-all font-medium text-text-primary">
                        {searched.term}
                      </span>
                      . Email lookup is exact — the whole address has to match, character for
                      character. Check it for a typo, or ask the player which address they signed up
                      with. If they have never made a Helm account, close this and use &ldquo;Invite
                      players&rdquo; to send them a join link.
                    </>
                  }
                />
              ) : (
                <EmptyState
                  variant="subtle"
                  icon={SearchX}
                  title="No one you can see by that name"
                  description={
                    <>
                      Nothing matches{' '}
                      <span className="break-words font-medium text-text-primary">
                        &ldquo;{searched.term}&rdquo;
                      </span>
                      . Searching by name only reaches players you already have access to — your own
                      program, and recruits you can view. To pick up a transfer from another
                      program, type their full email address instead; a last name or a partial
                      address will not find them.
                    </>
                  }
                />
              )
            ) : !searching && query.trim().length === 0 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                Type a name to search your own program, or a transfer&rsquo;s full email address to
                find them anywhere.
              </p>
            ) : query.trim().length > 0 && query.trim().length < 2 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                Keep typing — two characters minimum.
              </p>
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
                      <span className="flex w-full items-center gap-2">
                        <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                          {[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed player'}
                        </span>
                        {/* The two lookups carry different evidence: this row
                            was confirmed against an address the coach already
                            held, the rest are name substrings. Say which. */}
                        {searched?.exactEmailMatchId === p.id ? (
                          <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption text-text-secondary">
                            Exact email match
                          </span>
                        ) : null}
                      </span>
                      <span className="font-fw-sans text-caption text-text-tertiary">
                        {playerDetailLine(p)}
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
              <p className="font-fw-sans text-caption text-text-tertiary">
                {playerDetailLine(selected)}
              </p>
              {/* Position and class year alone are thin grounds for adding a
                  stranger to a roster. When this came from the email path,
                  restating which address it matched is the confirmation that
                  actually carries weight — and it is the coach's own input,
                  not a contact detail the lookup handed back. */}
              {searched?.exactEmailMatchId === selected.id ? (
                <p className="mt-1 font-fw-sans text-caption text-text-secondary">
                  Matched the email address you entered: {searched.term}
                </p>
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
            {saveError ? <p className="font-fw-sans text-caption text-fw-danger-ink">{saveError}</p> : null}
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
