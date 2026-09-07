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
 *   • Search, Files, Add member and Leave group have no existing capability
 *     anywhere in the messages tree. Drawing a control that does nothing is
 *     worse than not drawing it: it scores as coverage and reads as a bug.
 *
 * So they are absent by deferral, not by disagreement — the same disposition
 * G-55 recorded for Reply. The sheet is laid out so each has an obvious slot
 * when its capability lands.
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
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Avatar, AvatarGroup } from '@/components/fairway/controls/avatar';
import { Button } from '@/components/fairway/controls/button';
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
}: {
  member: GroupMember;
  isYou: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-fw-md px-2.5 py-2">
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
}: GroupDetailsSheetProps) {
  const [showAll, setShowAll] = React.useState(false);

  // Collapse again on close, so reopening starts where the artboard does.
  React.useEffect(() => {
    if (!open) setShowAll(false);
  }, [open]);

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
      hideClose
      /* Desktop is CAPPED, not designed — `SIDE_CLASS.bottom` is `inset-x-0`,
         so without this the sheet is a phone control stretched across a 1440px
         monitor. Every artboard here is a 390×844 phone scene and supplies no
         desktop authority, so the measure is capped and nothing is invented.
         Same disposition as G-56's action sheet, and the leading edge keeps the
         variant's `rounded-t-fw-lg` (rounding all four would be wrong for a
         bottom-anchored panel and would trip G-48's guard). */
      className="sm:mx-auto sm:max-w-sm"
    >
      <div className="flex flex-col px-3.5 pb-6">
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

        <div className="mb-2 px-1">
          <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">Members</span>
        </div>

        <div className="flex flex-col gap-px">
          {visible.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isYou={m.id === currentUserId}
              isAdmin={Boolean(creatorId) && m.id === creatorId}
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

        {/* A group whose names have not resolved yet — the participant rows
            exist (the count above is real) but no coach/player row matched.
            Says so, rather than rendering an empty list under a live count. */}
        {ordered.length === 0 && (
          <p className={cn('px-3.5 py-3 font-fw-sans text-caption-1 text-text-tertiary')}>
            Member details are unavailable right now.
          </p>
        )}
      </div>
    </Sheet>
  );
}
