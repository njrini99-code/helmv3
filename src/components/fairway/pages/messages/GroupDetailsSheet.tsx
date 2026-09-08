'use client';

/**
 * ============================================================================
 * GroupDetailsSheet — W7 (G-33 · D-03a · G-30 · G-57)
 * ----------------------------------------------------------------------------
 * The surface a group conversation opens onto: who is in it, and who made it.
 *
 * Built fresh. `ConversationDetailsSheet.tsx` appears throughout the audit
 * corpus but exists nowhere under `src/` — it lived on unmerged branches
 * (M00 F1/F15). Nothing was ported; this is written on the `Sheet` primitive,
 * which supersedes the plain-`<div>` sheet those branches used.
 *
 * WHAT THE ARTBOARD SUPPLIES AND WHAT IT DOES NOT
 * `GroupDetails.dc.html` draws six things: an identity block, three quick
 * actions (Mute / Search / Files), a MEMBERS list with an "Add" link, a shared
 * files section, and a "Leave group" row. Only the identity block and the
 * member list are named by any of W7's four findings, and the rest have no
 * contract behind them:
 *
 *   • Mute is G-02, deferred — it depends on G-58's migration being APPLIED,
 *     which is the owner's step, not this branch's.
 *   • Search and Files have no capability anywhere in the messages tree.
 *     Drawing a control that does nothing is worse than not drawing it: it
 *     scores as coverage and reads as a bug.
 *
 * So they are absent by deferral, not by disagreement — the same disposition
 * G-55 recorded for Reply. The sheet is laid out so each has an obvious slot
 * when its capability lands.
 *
 * MEMBERSHIP: ADD, REMOVE, LEAVE
 * The artboard's "Add" link (`:82`) and "Leave group" row (`:143`) are now
 * live, and a per-row Remove — which the artboard does not draw — is added
 * beside them, because "add a member" without "remove a member" leaves a group
 * that can only ever grow.
 *
 * These three are NOT equally available, and the difference is in the database,
 * not here:
 *
 *   • LEAVE works against production RLS as it stands. The baseline
 *     `golf_participants_delete` is `USING (user_id = auth.uid())` — deleting
 *     your own participant row is the one membership mutation permitted today.
 *   • ADD and REMOVE need
 *     `20260907160000_golf_team_chat_membership_management.sql` APPLIED. Until
 *     it is, `golf_participants_insert_v2`'s creator branch is bounded to
 *     creation time and the delete policy has no creator branch at all, so both
 *     are refused with 42501.
 *
 * They are still rendered rather than gated behind a flag, because the
 * predicate that decides whether they APPEAR is a real one — you must be the
 * group's creator, the same bound both new policy branches carry and the same
 * bound the Admin pill already draws. A refusal surfaces as the action's error
 * message and is recorded through `maybeCaptureRlsDenial`; it is never a silent
 * no-op. A flag constant would add a second thing for the owner to remember and
 * would still ship no capability.
 *
 * Both destructive paths confirm inline, reusing the two-icon `Inset` pattern
 * G-56 established for message delete rather than a stacked overlay — a second
 * overlay above a Sheet is the z-index trap `design-system.md` documents.
 *
 * TOKENS — measured on both sides, not chosen
 * Every value below was read out of the artboard and matched against the token
 * file rather than eyeballed. The panel itself (`1.75rem 1.75rem 0 0` radius,
 * `rgb(244 232 210 / 0.88)` glass, `blur(36px)`, the two-layer modal shadow) is
 * byte-identical to what `Sheet`'s bottom variant already renders, so the panel
 * is the primitive's, untouched. Inside it:
 *
 *   .row  `border-radius: 0.875rem`        = --fw-radius-md ("list rows")
 *   .hd   11px / 0.06em / 600              = text-eyebrow, byte-identical
 *   .sub  12px / 17px / 400                = text-caption-1 (12px / 1.4 / 400)
 *   .nm   15px / 21px / 500                = text-subhead  (15px / 1.35)
 *   title 20px / 26px / 600                = text-title-3  (20px / 1.2 / 600)
 *   colours: text-tertiary, accent-100, accent-700, surface-sunken — all four
 *   byte-identical to the artboard's oklch literals.
 *
 * Three of those four type steps come from `tailwind.config.ts`'s **iOS TYPE
 * SCALE — Apple HIG** block rather than the canonical Fairway ramp, and that is
 * a measurement result, not a preference: on size AND weight the iOS steps hit
 * the artboard exactly where the canonical ramp misses (canonical `caption` is
 * 12px but forces weight 500; canonical `body` is 15px but at a 24px leading
 * against the drawn 21px). This surface is an iOS-shaped detail sheet inside a
 * Capacitor WKWebView, which is the use the config's own comment names — the
 * same reasoning that put `text-callout` on G-56's action rows.
 *
 * WHAT IS DELIBERATELY NOT DRAWN
 *   • The presence dot on `:94-96`. D-01a / G-51: production `users` RLS cannot
 *     resolve a teammate's state, so the dot would be decoration that implies a
 *     fact nobody can check. DECISIONS.md states this outcome verbatim.
 *   • Any role beyond the creator. `golf_conversation_participants` has no role
 *     column at all, and `users.role = 'admin'` is a PLATFORM super-admin flag
 *     that would badge a Helm staff account as a group admin while badging the
 *     actual creator as nothing (§24.5).
 *
 * The Admin pill is therefore read-only by construction. There is no schema to
 * write a promotion to, so nothing here implies one is possible.
 * ============================================================================
 */

import * as React from 'react';
import { Check, UserMinus, X } from 'lucide-react';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Avatar, AvatarGroup } from '@/components/fairway/controls/avatar';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Inset } from '@/components/fairway/surfaces/surface';
import { cn } from '@/lib/utils';

/**
 * One row of the member list.
 *
 * NOT `GolfConversationParticipant`, whose `subtitle` is required — the DM path
 * that owns it fills the gap with 'Golf Coach' / 'Golf Player', and D-03a is
 * explicit that a missing title or graduation year renders NO subtitle rather
 * than a placeholder. Reusing that interface would have forced the exact string
 * the decision forbids.
 */
export interface GroupMember {
  /** `golf_conversation_participants.user_id` — the id conversations key on. */
  id: string;
  name: string;
  avatar: string | null;
  /** `golf_coaches.title`, or `Class of {golf_players.graduation_year}`. */
  subtitle?: string;
  type: 'coach' | 'player';
}

/**
 * A teammate who could be added — the shape `getGolfGroupAddCandidates`
 * returns. Separate from `GroupMember` because it is a different fact: a
 * candidate has no participant row yet, so it has no membership to describe.
 */
export interface GroupAddCandidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string | null;
  type: 'coach' | 'player';
}

/** How many rows show before "Show all N" — the artboard draws four (`:53-84`). */
const COLLAPSED_MEMBER_COUNT = 4;

export interface GroupDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Group name. Falls back to the generic label only when the row has none. */
  title: string;
  /** ISO timestamp of `golf_conversations.created_at`. */
  createdAt?: string | null;
  /** `golf_conversations.created_by`, forwarded as `creator_id` (D-03a). */
  creatorId?: string | null;
  /** The viewer, so their own row reads "(you)". */
  currentUserId?: string | null;
  members: GroupMember[];
  /**
   * The authoritative member count, from the same participant rows the header
   * counts. Falls back to `members.length` — which is the count of members
   * whose NAME resolved, and can legitimately be lower.
   */
  memberCount?: number;

  /**
   * Membership management. All three are optional: a caller that supplies none
   * gets exactly the read-only sheet, which is what every non-group surface
   * and every test written before this wiring expects.
   *
   * Add and Remove additionally require the viewer to be the creator — the
   * component decides that from `creatorId`/`currentUserId` rather than taking
   * it on trust, so a caller cannot accidentally offer a control the database
   * will refuse.
   */
  onAddMember?: (userId: string) => Promise<{ error?: string } | void>;
  onRemoveMember?: (userId: string) => Promise<{ error?: string } | void>;
  onLeaveGroup?: () => Promise<{ error?: string } | void>;
  /** Loads the addable teammates, called when Add is opened (never on mount). */
  loadAddCandidates?: () => Promise<GroupAddCandidate[]>;
}

/** `Jul 21` — month and day, the artboard's own format (`:60`). */
function formatCreatedOn(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Viewer first, then everyone else by name.
 *
 * The artboard's first row is the viewer (`:53-57`, "Nick Rini (you)"), who in
 * that scene is ALSO the creator — so it does not discriminate between
 * "viewer first" and "creator first". Viewer-first is the one that holds for
 * every member of every group; creator-first would reorder the list under you
 * depending on which group you opened. Alphabetical after that, because
 * `golf_conversation_participants` carries no join order worth surfacing.
 *
 * Exported so the ordering is exercised directly rather than only asserted to
 * exist — same split the G-13 stale-fetch suite uses.
 */
export function orderMembers(
  members: readonly GroupMember[],
  currentUserId?: string | null,
): GroupMember[] {
  const rest = members
    .filter((m) => m.id !== currentUserId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const you = currentUserId ? members.find((m) => m.id === currentUserId) : undefined;
  return you ? [you, ...rest] : rest;
}

/**
 * "9 members · created by you, Jul 21" — assembled from the parts that
 * resolved, and only those.
 *
 * An unknown creator (no id, or names have not landed yet) drops the whole
 * clause rather than printing "created by someone"; an unparseable timestamp
 * drops the date but keeps the creator. The count always survives, because it
 * comes from the participant rows themselves rather than from a name lookup.
 */
export function describeGroup(args: {
  total: number;
  creatorId?: string | null;
  currentUserId?: string | null;
  members: readonly GroupMember[];
  createdAt?: string | null;
}): string {
  const { total, creatorId, currentUserId, members, createdAt } = args;
  const parts: string[] = [`${total} ${total === 1 ? 'member' : 'members'}`];
  if (creatorId) {
    const creatorName =
      creatorId === currentUserId
        ? 'you'
        : members.find((m) => m.id === creatorId)?.name;
    if (creatorName) {
      const on = createdAt ? formatCreatedOn(createdAt) : null;
      parts.push(on ? `created by ${creatorName}, ${on}` : `created by ${creatorName}`);
    }
  }
  return parts.join(' · ');
}

function MemberRow({
  member,
  isYou,
  isAdmin,
  canRemove,
  confirming,
  busy,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  member: GroupMember;
  isYou: boolean;
  isAdmin: boolean;
  /** Creator, and not this row — see the sheet's membership note. */
  canRemove: boolean;
  confirming: boolean;
  busy: boolean;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      {/* `md` is 40px against the artboard's 42px — absorbed to the scale step
          rather than written as an arbitrary size, the same call G-29c made on
          the header stack. `decorative` because the name is right beside it;
          without it a row announces "AB Alexis Bennett Alexis Bennett". */}
      <Avatar decorative name={member.name} src={member.avatar} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-fw-sans text-subhead font-medium text-text-primary">
          {member.name}
          {isYou && (
            <span className="font-normal text-text-tertiary"> (you)</span>
          )}
        </span>
        {/* Rendered only when there is a real fact to render — never a
            placeholder (D-03a). The row is one line tall when absent. */}
        {member.subtitle && (
          <span className="truncate font-fw-sans text-caption-1 text-text-tertiary">
            {member.subtitle}
          </span>
        )}
      </div>
      {isAdmin && (
        <span className="flex-shrink-0 rounded-full bg-accent-100 px-2.5 py-[3px] font-fw-sans text-eyebrow text-accent-700">
          Admin
        </span>
      )}
      {/* Confirmation is INLINE and mirrors G-56's message-delete pattern —
          `Inset` on the danger tokens, a check and an X. A stacked overlay
          above a Sheet is the z-index trap design-system.md documents, and a
          window.confirm would block the WKWebView outright. */}
      {canRemove && confirming && (
        <Inset padding="none" className="flex flex-shrink-0 items-center gap-1 bg-fw-danger-bg px-2.5 py-1.5">
          <span className="mr-1 font-fw-sans text-eyebrow text-fw-danger-ink">Remove?</span>
          {/* Safe to hand `busy` straight to the primitive: this pair only
              renders for the ONE member whose `removeConfirmId` is armed, so
              there is no set of siblings to spin at once. `IconButton` swaps
              its child for the spinner rather than adding one beside it, so the
              check becomes a ring in place. */}
          <IconButton
            variant="danger"
            size="sm"
            aria-label={`Confirm remove ${member.name}`}
            disabled={busy}
            busy={busy}
            onClick={onConfirmRemove}
          >
            <Check size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Cancel remove"
            disabled={busy}
            onClick={onCancelRemove}
          >
            <X size={18} aria-hidden="true" />
          </IconButton>
        </Inset>
      )}
      {canRemove && !confirming && (
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={`Remove ${member.name}`}
          className="flex-shrink-0"
          onClick={onAskRemove}
        >
          <UserMinus size={18} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}

/** One row of the add-a-member list — a teammate who is not in the group. */
function CandidateRow({
  candidate,
  busy,
  pending,
  onAdd,
}: {
  candidate: GroupAddCandidate;
  busy: boolean;
  /** THIS row's add is the one in flight — only it draws the spinner. */
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
      <Avatar decorative name={candidate.name} src={candidate.avatarUrl} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-fw-sans text-subhead font-medium text-text-primary">
          {candidate.name}
        </span>
        {candidate.subtitle && (
          <span className="truncate font-fw-sans text-caption-1 text-text-tertiary">
            {candidate.subtitle}
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        busy={pending}
        onClick={onAdd}
        className="h-9 flex-shrink-0 rounded-fw-md px-3 font-fw-sans text-caption-1 font-medium text-accent-700"
      >
        Add
      </Button>
    </div>
  );
}

export function GroupDetailsSheet({
  open,
  onOpenChange,
  title,
  createdAt,
  creatorId,
  currentUserId,
  members,
  memberCount,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
  loadAddCandidates,
}: GroupDetailsSheetProps) {
  const [showAll, setShowAll] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [candidates, setCandidates] = React.useState<GroupAddCandidate[] | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = React.useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  /**
   * WHICH action is in flight, not merely THAT one is.
   *
   * `busy` alone is enough to lock the sheet, and that is all it was ever used
   * for — every mutating control set `disabled={busy}` and none set the
   * primitive's own `busy` prop, so a tap greyed the whole sheet out and drew
   * no progress anywhere. Two sheets in this same directory
   * (`FairwayNewMessageSheet`, `FairwayTeamBroadcastSheet`) already pass
   * `busy=` on their CTA, so this was the odd one out rather than a house
   * style.
   *
   * A single boolean cannot be handed straight to `busy=` here, though: the
   * Add button is rendered once PER CANDIDATE, so one flag would spin every
   * row in the list at once — worse than the grey-out it replaced, because it
   * claims several requests are running when one is. The key names the
   * candidate (or the singleton action) that was actually pressed; every other
   * control still takes plain `disabled={busy}`.
   */
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Reset every transient state on close, so reopening starts where the
  // artboard does. A confirmation left armed across a close-and-reopen is the
  // shape that turns a mis-tap into a removal.
  React.useEffect(() => {
    if (!open) {
      setShowAll(false);
      setAdding(false);
      setCandidates(null);
      setRemoveConfirmId(null);
      setLeaveConfirm(false);
      setError(null);
      setPendingKey(null);
    }
  }, [open]);

  /**
   * The viewer created this group.
   *
   * The same predicate both new policy branches carry, and the same one the
   * Admin pill already draws — so what the sheet OFFERS and what the database
   * PERMITS are derived from one fact rather than two that can drift.
   */
  const isCreator = Boolean(creatorId) && creatorId === currentUserId;
  const canManage = isCreator && Boolean(onAddMember) && Boolean(onRemoveMember);

  // Every membership call funnels through here so no path can forget to clear
  // `busy` or to surface a refusal. A 42501 from an unapplied migration
  // arrives as `error` and is shown, never swallowed into a silent no-op.
  const run = React.useCallback(
    async (
      fn: () => Promise<{ error?: string } | void>,
      onDone?: () => void,
      key?: string,
    ) => {
      setBusy(true);
      setPendingKey(key ?? null);
      setError(null);
      try {
        const result = await fn();
        if (result && 'error' in result && result.error) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch {
        setError('Something went wrong. Try again.');
      } finally {
        setBusy(false);
        setPendingKey(null);
      }
    },
    [],
  );

  const openAdd = React.useCallback(() => {
    setAdding(true);
    setError(null);
    if (!loadAddCandidates) return;
    // Loaded on open rather than on mount: the list is only meaningful once
    // someone asks for it, and a group's roster is a query nobody should pay
    // for by opening the details sheet.
    setCandidates(null);
    void loadAddCandidates()
      .then(setCandidates)
      .catch(() => {
        setCandidates([]);
        setError('Could not load teammates.');
      });
  }, [loadAddCandidates]);

  const ordered = React.useMemo(
    () => orderMembers(members, currentUserId),
    [members, currentUserId],
  );

  const total = memberCount ?? ordered.length;
  const visible = showAll ? ordered : ordered.slice(0, COLLAPSED_MEMBER_COUNT);
  const hiddenCount = ordered.length - visible.length;

  const meta = React.useMemo(
    () => describeGroup({ total, creatorId, currentUserId, members, createdAt }),
    [total, creatorId, currentUserId, members, createdAt],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={title || 'Group details'}
      hideTitle
      /* Desktop is CAPPED, not designed — `SIDE_CLASS.bottom` is `inset-x-0`,
         so without this the sheet is a phone control stretched across a 1440px
         monitor. Every artboard here is a 390×844 phone scene and supplies no
         desktop authority, so the measure is capped and nothing is invented.
         Same disposition as G-56's action sheet, and the leading edge keeps the
         variant's `rounded-t-fw-lg` (rounding all four would be wrong for a
         bottom-anchored panel and would trip G-48's guard). */
      className="!bg-canvas sm:mx-auto sm:max-w-sm"
    >
      <Sheet.Body className="flex flex-col px-4 pt-4">
        {/* Identity — the group's own object: real faces, then its name. */}
        <div className="mb-5 flex flex-col items-center gap-2.5">
          {ordered.length > 0 && (
            /* `ring-surface`, not the primitive's `ring-canvas` default: the
               rims read as cutouts in the panel they sit on, and a Sheet's body
               is a surface. Same reasoning and same token as the thread
               header's stack (G-29c). `lg` is 48px against the artboard's 58px
               — absorbed to the scale step, as the header stack was. */
            <AvatarGroup size="lg" max={3} ring="ring-surface">
              {ordered.map((m) => (
                <Avatar key={m.id} decorative name={m.name} src={m.avatar} size="lg" />
              ))}
            </AvatarGroup>
          )}
          <div className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="max-w-full truncate font-fw-sans text-title-3 text-text-primary">
              {title || 'Group'}
            </span>
            <span className="font-fw-sans text-caption-1 text-text-tertiary">{meta}</span>
          </div>
        </div>

        {/* The artboard puts "Add" on the MEMBERS heading's baseline, right-
            aligned (`:80-82`) — 12px / 500 in the accent, which is
            `text-caption-1 font-medium text-accent-700`. It appears only for
            the creator, because only the creator's insert is permitted. */}
        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">
            {adding ? 'Add member' : 'Members'}
          </span>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              onClick={adding ? () => setAdding(false) : openAdd}
              className="h-auto rounded-fw-sm px-1 py-0 font-fw-sans text-caption-1 font-medium text-accent-700"
            >
              {adding ? 'Done' : 'Add'}
            </Button>
          )}
        </div>

        {/* A refusal has to be visible. Before the membership migration is
            applied, an add or a remove comes back 42501 and lands here rather
            than looking like a control that did nothing. */}
        {error && (
          <p className="mb-2 px-1 font-fw-sans text-caption-1 text-fw-danger-ink">{error}</p>
        )}

        {adding ? (
          <div className="flex flex-col divide-y divide-border-subtle rounded-card bg-surface shadow-soft">
            {candidates === null && (
              <p className="px-3.5 py-3 font-fw-sans text-caption-1 text-text-tertiary">
                Loading teammates…
              </p>
            )}
            {candidates?.length === 0 && (
              <p className="px-3.5 py-3 font-fw-sans text-caption-1 text-text-tertiary">
                Everyone on this team is already in the group.
              </p>
            )}
            {candidates?.map((c) => (
              <CandidateRow
                key={c.userId}
                candidate={c}
                busy={busy}
                pending={pendingKey === `add:${c.userId}`}
                onAdd={() =>
                  void run(
                    () => onAddMember!(c.userId),
                    // Drop the added teammate from the list rather than
                    // refetching: the server is the authority on membership,
                    // but re-querying on every add would make a run of adds
                    // N round trips slower for no new information.
                    () => setCandidates((prev) => (prev ?? []).filter((x) => x.userId !== c.userId)),
                    `add:${c.userId}`,
                  )
                }
              />
            ))}
          </div>
        ) : (
        <div className="flex flex-col divide-y divide-border-subtle rounded-card bg-surface shadow-soft">
          {visible.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isYou={m.id === currentUserId}
              isAdmin={Boolean(creatorId) && m.id === creatorId}
              /* Never on your own row: the creator leaving is "Leave group",
                 which has a different consequence and its own control. This
                 mirrors the policy's own orphan guard rather than restating
                 it — the branch requires `user_id <> auth.uid()`. */
              canRemove={canManage && m.id !== currentUserId}
              confirming={removeConfirmId === m.id}
              busy={busy}
              onAskRemove={() => {
                setError(null);
                setRemoveConfirmId(m.id);
              }}
              onCancelRemove={() => setRemoveConfirmId(null)}
              onConfirmRemove={() =>
                void run(() => onRemoveMember!(m.id), () => setRemoveConfirmId(null))
              }
            />
          ))}
          {/* The artboard truncates at four and offers "Show all 9" (`:83`), so
              the truncation itself is a design fact rather than a convenience.
              A Button, not a bare <span>: it is a real control, and
              `helm/no-raw-button` is right that it should carry focus and hit
              area from the primitive. */}
          {hiddenCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAll(true)}
              className="h-11 justify-start rounded-fw-md px-3.5 font-fw-sans text-body-sm font-medium text-accent-700"
            >
              {`Show all ${ordered.length}`}
            </Button>
          )}
        </div>
        )}

        {/* A group whose names have not resolved yet — the participant rows
            exist (the count above is real) but no coach/player row matched.
            Says so, rather than rendering an empty list under a live count. */}
        {!adding && ordered.length === 0 && (
          <p className={cn('px-3.5 py-3 font-fw-sans text-caption-1 text-text-tertiary')}>
            Member details are unavailable right now.
          </p>
        )}

        {/* Leave group — the artboard's bottom pill (`:141-144`): full-width,
            50px, fully rounded, 15px/600 on the danger tokens. Unlike Add and
            Remove this works against production RLS as it stands, so it is
            shown to every member including the creator; the policy's self-
            delete branch is what backs it. */}
        {!adding && onLeaveGroup && (
          <div className="mt-5">
            {leaveConfirm ? (
              <Inset padding="none" className="flex h-[50px] items-center justify-center gap-2 rounded-full bg-fw-danger-bg px-4">
                <span className="font-fw-sans text-footnote text-fw-danger-ink">
                  Leave this group?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  busy={busy}
                  onClick={() => void run(() => onLeaveGroup(), () => onOpenChange(false), 'leave')}
                  className="h-9 rounded-full px-3 font-fw-sans text-footnote font-semibold text-fw-danger-ink"
                >
                  Leave
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setLeaveConfirm(false)}
                  className="h-9 rounded-full px-3 font-fw-sans text-footnote font-medium text-text-secondary"
                >
                  Cancel
                </Button>
              </Inset>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setLeaveConfirm(true);
                }}
                className="h-12 w-full rounded-fw-md bg-surface font-fw-sans text-subhead font-medium text-fw-danger-ink"
              >
                Leave group
              </Button>
            )}
          </div>
        )}
      </Sheet.Body>
    </Sheet>
  );
}
