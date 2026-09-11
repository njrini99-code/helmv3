// @vitest-environment jsdom
//
// W7 — group details: G-33 (member data), D-03a (role-dependent subtitle +
// Admin pill from `created_by`, no presence dot), G-30 (the header slot) and
// G-57 (the header delta, whose remaining third IS G-30).
//
// MEASURED ON BOTH SIDES wherever a value maps: each assertion parses the
// number out of `GroupDetails.dc.html` AND out of the token/config file it is
// claimed to match, then compares them — so the suite fails if either side
// moves, not just if the component drifts. A hardcoded expectation would let a
// token change slide past.
//
// The two derivations that could be subtly wrong — member ordering and the
// "N members · created by …" line — are exercised directly rather than asserted
// to exist, matching the split the G-13 stale-fetch suite established: source
// assertions prove the code is PRESENT, a direct test proves it is RIGHT.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orderMembers, describeGroup, type GroupMember } from './GroupDetailsSheet';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

const artboard = read('audit/reference/GroupDetails.dc.html');
const tokens = read('src/styles/design-tokens.css');
const tailwind = read('tailwind.config.ts');
const sheet = read('src/components/fairway/pages/messages/GroupDetailsSheet.tsx');
const pane = read('src/components/fairway/pages/messages/MessageThreadPane.tsx');
const page = read('src/components/fairway/pages/messages/FairwayMessages.tsx');
const hook = read('src/hooks/golf/use-golf-messages.ts');

/**
 * Block comments removed whole, then line comments.
 *
 * Every one of these files documents the defect it fixes by quoting it, so a
 * naive whole-file search finds the old shape inside the prose describing its
 * removal. Assertions about what the CODE does read the stripped text.
 */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const sheetCode = strip(sheet);
const paneCode = strip(pane);
const pageCode = strip(page);
const hookCode = strip(hook);

/** A `--fw-*` declaration's value, from the LIGHT block. */
function token(name: string): string {
  const m = tokens.match(new RegExp(`^\\s*${name}:\\s*([^;/]+)`, 'm'));
  expect(m, `expected ${name} in design-tokens.css`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

/** One `fontSize` step out of tailwind.config.ts, as its raw tuple text. */
function typeStep(name: string): string {
  const m = tailwind.match(new RegExp(`'${name}':\\s*\\[([^\\]]+)\\]`));
  expect(m, `expected the '${name}' type step in tailwind.config.ts`).not.toBeNull();
  return (m?.[1] ?? '').trim();
}

/** One class rule's body out of the artboard's <style> block. */
function artboardRule(cls: string): string {
  const m = artboard.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
  expect(m, `expected .${cls} in GroupDetails.dc.html`).not.toBeNull();
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

// ───────────────────────────────────────────────────────────────────────────
// The artboard and the token file, compared to each other.
// ───────────────────────────────────────────────────────────────────────────

describe('W7 — the values the artboard states already exist as tokens', () => {
  it('the member row radius IS --fw-radius-md, whose own comment reads "list rows"', () => {
    const row = artboardRule('row');
    expect(row).toContain('border-radius: 0.875rem');
    expect(token('--fw-radius-md')).toBe('0.875rem');
  });

  it('the MEMBERS heading IS the eyebrow step, byte for byte', () => {
    const hd = artboardRule('hd');
    expect(hd).toContain('font-size: 11px');
    expect(hd).toContain('letter-spacing: 0.06em');
    expect(hd).toContain('font-weight: 600');

    const eyebrow = typeStep('eyebrow');
    expect(eyebrow).toContain("'11px'");
    expect(eyebrow).toContain("letterSpacing: '0.06em'");
    expect(eyebrow).toContain("fontWeight: '600'");
  });

  it('the row subtitle is 12px at NORMAL weight — which caption-1 is and canonical caption is not', () => {
    // This is the whole reason the iOS step is the right one here. The
    // canonical ramp's `caption` is also 12px but forces weight 500; the
    // artboard's `.sub` sets no weight at all, i.e. 400.
    const sub = artboardRule('sub');
    expect(sub).toContain('font-size: 12px');
    expect(sub).not.toContain('font-weight');

    expect(typeStep('caption-1')).toContain("fontWeight: '400'");
    expect(typeStep('caption')).toContain("fontWeight: '500'");
  });

  it('the member name is 15px, and subhead leads closer to the drawn 21px than body does', () => {
    const nm = artboardRule('nm');
    expect(nm).toContain('font-size: 15px');
    expect(nm).toContain('line-height: 21px');

    // Both steps are 15px; they differ on leading, and the artboard settles it.
    expect(typeStep('subhead')).toContain("'15px'");
    expect(typeStep('body')).toContain("'15px'");
    // subhead 1.35 × 15 = 20.25px; body's literal 24px is three off in the
    // other direction.
    expect(typeStep('subhead')).toContain("lineHeight: '1.35'");
    expect(typeStep('body')).toContain("lineHeight: '24px'");
  });

  it('the group name is 20px/600 — exactly title-3', () => {
    // The identity block's own inline style, not a class.
    expect(artboard).toMatch(/font-size: 20px; line-height: 26px; font-weight: 600/);
    const t3 = typeStep('title-3');
    expect(t3).toContain("'20px'");
    expect(t3).toContain("fontWeight: '600'");
  });

  it('the Admin pill draws accent-100 on accent-700, both byte-identical to tokens', () => {
    const pill = artboard.match(/border-radius: 9999px; background: ([^;]+); font-size: 11px; font-weight: 600; color: ([^;]+);/);
    expect(pill, 'expected the Admin pill inline style').not.toBeNull();
    expect((pill?.[1] ?? '').trim()).toBe(token('--fw-color-accent-100'));
    expect((pill?.[2] ?? '').trim()).toBe(token('--fw-color-accent-700'));
  });

  it('truncates the list at four rows and offers the rest — a design fact, not a convenience', () => {
    // Four `.row` member entries, then a fifth row that is the link.
    expect(artboard).toContain('Show all 9');
    expect(artboard).toContain('9 members');
  });

  it('draws a presence dot that this build must NOT ship', () => {
    // Pinned so the omission stays a DECISION rather than an oversight: the dot
    // is genuinely in the design, and D-01a/G-51 is why it is not in the code.
    expect(artboard).toContain(token('--fw-color-accent-500'));
    expect(artboard).toMatch(/position: absolute; right: 0; bottom: 0; width: 11px/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// G-33 / D-03a — the data.
// ───────────────────────────────────────────────────────────────────────────

describe('G-33 — the member list has data underneath it', () => {
  it('the supplemental team-chat path no longer hardcodes an empty participant list', () => {
    expect(hookCode).not.toContain('participant_ids: [],');
    expect(hookCode).toContain('participant_ids: idsByConv.get(conv.id) ?? [],');
  });

  it('the ids come off the same rows the count does, so the two cannot disagree', () => {
    expect(hookCode).toContain(".select('conversation_id, user_id')");
    expect(hookCode).toContain('idsByConv.forEach((ids, cid) => countByConv.set(cid, ids.length));');
  });

  it('that query is paginated and stably ordered, now that it carries identity', () => {
    // As a count, the PostgREST 1000-row cap under-counted quietly. As the
    // source of WHO is in the group it would silently drop members.
    expect(hookCode).toContain('fetchAllRowsResult<{ conversation_id: string; user_id: string }>');
    expect(hookCode).toMatch(/\.order\('id', \{ ascending: true \}\)\s*\n\s*\.range\(from, to\)/);
  });

  it('the transform forwards both facts instead of dropping them', () => {
    // Every group conversation used to reach the UI having lost these, on BOTH
    // origin paths, because the `is_group` branch simply did not copy them out.
    expect(hookCode).toContain('participant_ids: conv.participant_ids ?? [],');
    expect(hookCode).toContain('creator_id: conv.creator_id ?? null,');
  });

  it('the type the UI consumes declares them', () => {
    expect(hookCode).toContain('participant_ids?: string[];');
    expect(hookCode).toContain('creator_id?: string | null;');
  });

  it('the participant join selects the two columns D-03a needs, and only those', () => {
    expect(pageCode).toContain("select('user_id, full_name, avatar_url, title')");
    expect(pageCode).toContain("select('user_id, first_name, last_name, avatar_url, graduation_year')");
  });

  it('derives the subtitle per role, with NO placeholder when the column is empty', () => {
    expect(pageCode).toContain('subtitle: c.title || undefined,');
    expect(pageCode).toContain("subtitle: p.graduation_year ? `Class of ${p.graduation_year}` : undefined,");
    // The DM path's fallbacks are exactly what D-03a forbids on these rows.
    const mapBuild = pageCode.slice(pageCode.indexOf('const map = new Map<string, GroupMember>()'));
    expect(mapBuild.slice(0, 1200)).not.toContain("'Golf Coach'");
    expect(mapBuild.slice(0, 1200)).not.toContain("'Golf Player'");
  });
});

describe('D-03a — the Admin pill reads a real column, and nothing else', () => {
  it('renders only for the conversation CREATOR', () => {
    expect(sheetCode).toContain('isAdmin={Boolean(creatorId) && m.id === creatorId}');
  });

  it('never infers a role from users.role, which is a platform flag', () => {
    expect(sheetCode).not.toContain("role === 'admin'");
    expect(sheetCode).not.toContain('users.role');
  });

  it('ships no presence dot — the artboard draws one and production RLS cannot resolve it', () => {
    expect(sheetCode).not.toContain('status=');
  });

  it('omits the subtitle line entirely when there is no fact for it', () => {
    expect(sheetCode).toContain('{member.subtitle && (');
  });
});

describe('W7 scope — the controls with no capability behind them are absent', () => {
  // Mute is G-02 and still waits on G-58's migration being APPLIED (the
  // owner's step); Search and Files have no contract anywhere in the messages
  // tree. Absent by deferral, not disagreement — and pinned so a later pass
  // adding one has to mean it.
  //
  // 'Add member' and 'Leave group' USED TO BE IN THIS LIST and were removed
  // deliberately when the membership actions landed, which is the mechanism
  // this block was written to force: enabling one of these costs a deleted
  // assertion, so it cannot happen by accident.
  it.each(['Mute', 'Search', 'Files'])(
    'does not draw a dead %s control',
    (label) => {
      expect(sheetCode).not.toContain(`>${label}<`);
    },
  );
});

// ───────────────────────────────────────────────────────────────────────────
// The component's own token application.
// ───────────────────────────────────────────────────────────────────────────

describe('W7 — the sheet applies the tokens the artboard states', () => {
  it('uses the list-row radius and the four measured type steps', () => {
    expect(sheetCode).toContain('rounded-fw-md');
    expect(sheetCode).toContain('text-eyebrow');
    expect(sheetCode).toContain('text-caption-1');
    expect(sheetCode).toContain('text-subhead');
    expect(sheetCode).toContain('text-title-3');
  });

  it('paints the pill from tokens, not from a literal', () => {
    expect(sheetCode).toContain('bg-accent-100');
    expect(sheetCode).toContain('text-accent-700');
    expect(sheetCode).not.toMatch(/oklch\(0\.939 0\.045 150\)/);
  });

  it('rims the identity stack against the surface it sits on, like the header does', () => {
    expect(sheetCode).toContain('ring="ring-surface"');
    expect(sheetCode).not.toContain('ring="ring-canvas"');
  });

  it('caps the measure on desktop rather than stretching a phone control', () => {
    // `SIDE_CLASS.bottom` is `inset-x-0`; uncapped this is a full-width band on
    // a 1440px monitor. Same disposition as G-56's action sheet.
    expect(sheetCode).toContain('sm:max-w-sm');
    // …but the leading edge keeps the variant's radius: rounding all four is
    // wrong for a bottom-anchored panel, and trips G-48's file-wide guard.
    expect(sheetCode).not.toContain('rounded-fw-lg');
  });

  it('collapses to the four rows the artboard draws', () => {
    expect(sheetCode).toContain('const COLLAPSED_MEMBER_COUNT = 4;');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// G-30 / G-57 — the header slot.
// ───────────────────────────────────────────────────────────────────────────

describe('G-30 / G-57 — the header has an entry point now', () => {
  it('renders a labelled info control', () => {
    expect(paneCode).toContain('aria-label="Group details"');
    expect(paneCode).toContain('<Info aria-hidden="true" />');
  });

  it('shows it only for a group, and only when there is something to open', () => {
    expect(paneCode).toContain('{isGroup && onOpenGroupDetails ? (');
  });

  it('does not let the control compress instead of the title truncating', () => {
    // The title column is `min-w-0 flex-1`; without shrink-0 a long group name
    // squeezes the button and the control changes size with the name.
    const idx = paneCode.indexOf('aria-label="Group details"');
    expect(idx).toBeGreaterThan(-1);
    expect(paneCode.slice(idx, idx + 300)).toContain('shrink-0');
  });

  it('is wired to the sheet from the page that owns the overlay state', () => {
    expect(pageCode).toContain('onOpenGroupDetails={() => setShowGroupDetails(true)}');
    expect(pageCode).toContain('{selectedConversation && isGroupConversation(selectedConversation) && (');
  });

  it('hands the sheet the row count AND the resolved names separately', () => {
    // They are different numbers on purpose: participant ROWS vs members whose
    // coach/player row resolved. Collapsing them would report the smaller one
    // as the truth.
    expect(pageCode).toContain('memberCount={selectedConversation.participant_count}');
    expect(pageCode).toContain('members={Array.from(groupParticipants.values()).filter((m) =>');
  });

  it('resolves message senders who are no longer members, without listing them as members', () => {
    // Removing a member made their existing bubbles render "Unknown", because
    // the identity map was keyed on CURRENT participants. Senders are a larger
    // set than members once Remove and Leave exist, so the map covers both —
    // and `groupMemberIds` is what the sheet lists, so a departed sender can
    // never reappear in the member list as a side effect of the fix.
    expect(pageCode).toContain("from('golf_messages')");
    expect(pageCode).toContain("select('sender_id')");
    expect(pageCode).toContain('new Set([...memberIds, ...(senders ?? []).map(m => m.sender_id)])');
    expect(pageCode).toContain('setGroupMemberIds(memberIds);');
    expect(pageCode).toContain('groupMemberIds.has(m.id),');
  });

  it('clears the member set wherever it clears the identity map', () => {
    // Two pieces of state that must move together: a stale member set against
    // a fresh map would list the previous conversation's people.
    const clears = pageCode.split('setGroupParticipants(new Map())').length - 1;
    const memberClears = pageCode.split('setGroupMemberIds(new Set())').length - 1;
    expect(memberClears).toBe(clears);
  });

  it('names a departed sender "Former member", never "Unknown"', () => {
    // Past the participant fetch's 1000-row cap the lookup can still miss.
    // "Unknown" reads as a data fault; "Former member" is the true statement.
    expect(paneCode).toContain("const senderName = senderInfo?.name ?? 'Former member';");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The two derivations, exercised directly.
// ───────────────────────────────────────────────────────────────────────────

const member = (id: string, name: string, subtitle?: string): GroupMember => ({
  id,
  name,
  avatar: null,
  subtitle,
  type: 'player',
});

describe('orderMembers', () => {
  const roster = [
    member('u-maya', 'Maya Torres'),
    member('u-me', 'Nick Rini'),
    member('u-alexis', 'Alexis Bennett'),
    member('u-jordan', 'Jordan Rivera'),
  ];

  it('puts the viewer first, wherever they sit in the input', () => {
    expect(orderMembers(roster, 'u-me').map((m) => m.id)[0]).toBe('u-me');
  });

  it('orders everyone else by name', () => {
    expect(orderMembers(roster, 'u-me').map((m) => m.name)).toEqual([
      'Nick Rini',
      'Alexis Bennett',
      'Jordan Rivera',
      'Maya Torres',
    ]);
  });

  it('is purely alphabetical when the viewer is not a member', () => {
    expect(orderMembers(roster, 'u-stranger').map((m) => m.name)).toEqual([
      'Alexis Bennett',
      'Jordan Rivera',
      'Maya Torres',
      'Nick Rini',
    ]);
  });

  it('does not drop anyone when the viewer is unknown', () => {
    expect(orderMembers(roster, null)).toHaveLength(roster.length);
    expect(orderMembers(roster, undefined)).toHaveLength(roster.length);
  });

  it('does not mutate the array it was handed', () => {
    const input = [...roster];
    orderMembers(input, 'u-me');
    expect(input.map((m) => m.id)).toEqual(roster.map((m) => m.id));
  });
});

describe('describeGroup', () => {
  const members = [member('u-me', 'Nick Rini'), member('u-alexis', 'Alexis Bennett')];

  it('names the viewer as the creator in the second person', () => {
    expect(
      describeGroup({
        total: 9,
        creatorId: 'u-me',
        currentUserId: 'u-me',
        members,
        createdAt: '2026-07-21T15:00:00.000Z',
      }),
    ).toBe('9 members · created by you, Jul 21');
  });

  it('names another member by name', () => {
    expect(
      describeGroup({
        total: 2,
        creatorId: 'u-alexis',
        currentUserId: 'u-me',
        members,
        createdAt: '2026-07-21T15:00:00.000Z',
      }),
    ).toBe('2 members · created by Alexis Bennett, Jul 21');
  });

  it('drops the whole clause when the creator cannot be named — never "created by someone"', () => {
    expect(
      describeGroup({
        total: 9,
        creatorId: 'u-nobody',
        currentUserId: 'u-me',
        members,
        createdAt: '2026-07-21T15:00:00.000Z',
      }),
    ).toBe('9 members');
  });

  it('drops the clause when there is no creator id at all', () => {
    expect(describeGroup({ total: 4, members, currentUserId: 'u-me' })).toBe('4 members');
  });

  it('keeps the creator when the timestamp is missing or unparseable', () => {
    expect(
      describeGroup({ total: 3, creatorId: 'u-me', currentUserId: 'u-me', members }),
    ).toBe('3 members · created by you');
    expect(
      describeGroup({
        total: 3,
        creatorId: 'u-me',
        currentUserId: 'u-me',
        members,
        createdAt: 'not a date',
      }),
    ).toBe('3 members · created by you');
  });

  it('says "1 member", not "1 members"', () => {
    expect(describeGroup({ total: 1, members })).toBe('1 member');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Membership management — add, remove, leave.
//
// The three do NOT have the same standing, and the difference is in the
// database rather than in this component:
//
//   • LEAVE works against production RLS as it stands (`golf_participants_-
//     delete` is `USING (user_id = auth.uid())`).
//   • ADD and REMOVE need 20260907160000 APPLIED. Until then both come back
//     42501.
//
// So the assertions below are in two groups: the ones that pin the SOURCE (the
// migration exists and says what it must, the actions surface a refusal rather
// than swallowing it) and the ones that pin the PREDICATE (who is offered the
// controls at all). Behaviour of the policies themselves is not this suite's
// job — that is `supabase/tests/rls/golf_group_membership_management.sql`,
// which exercises a real Postgres.
// ───────────────────────────────────────────────────────────────────────────

const migration = read(
  'supabase/migrations/20260907160000_golf_team_chat_membership_management.sql',
);
const actions = strip(read('src/app/actions/messages.ts'));
const rlsSuite = read('supabase/tests/rls/golf_group_membership_management.sql');

describe('membership — the migration is bounded on all three axes', () => {
  // The whole defensibility of re-opening a branch closed after a verified
  // production attack rests on these three bounds holding TOGETHER. Each is
  // asserted separately so dropping any one of them goes red.
  it('bounds the new INSERT branch to a genuine team chat, never a DM', () => {
    expect(migration).toContain('c.is_team_chat = true');
    expect(migration).toContain('c.team_id is not null');
  });

  it('bounds the actor to the conversation creator', () => {
    expect(migration).toContain('golf_conversation_created_by_me(');
  });

  it('bounds the person being ADDED to someone already on the owning team', () => {
    expect(migration).toContain('golf_user_on_conversation_team(');
  });

  it('keeps both pre-existing INSERT branches verbatim', () => {
    // Branch 2 is 20260819070000's own hardening. If this clause disappears,
    // the 2026-08-19 defect is back regardless of what the new branch says.
    expect(migration).toContain('not public.golf_conversation_has_other_participant(conversation_id)');
    // Branch 1 is the 2026-08-07 self-add bound.
    expect(migration).toContain('golf_conversation_on_my_team(');
  });

  it('keeps self-delete as the DELETE policy\'s first branch — that is Leave group', () => {
    expect(migration).toContain('golf_conversation_participants.user_id = (select auth.uid())');
  });

  it('excludes the creator\'s own row from the creator DELETE branch (orphan guard)', () => {
    expect(migration).toContain('golf_conversation_participants.user_id <> (select auth.uid())');
  });

  it('requires the ACTOR to still be in the conversation to remove anyone', () => {
    // This PR ships Leave group, so 20260819070000's "creator is always a
    // participant" observation stopped bounding anything the moment the DELETE
    // branch existed. Measured on a real Postgres: a departed creator already
    // removes nothing, because golf_participants_select_v2 makes the target
    // rows invisible. The clause is deliberately redundant with THAT policy —
    // it keeps this branch's bound inside this branch, so an edit over there
    // cannot silently unbound it here.
    const del = migration.slice(migration.indexOf('create policy golf_participants_delete'));
    expect(del.slice(0, del.indexOf('commit;'))).toContain(
      'select public.user_conversation_ids((select auth.uid()))',
    );
  });

  it('pairs the new SECURITY DEFINER helper with the revokes anon requires', () => {
    // A definer function is EXECUTE-to-PUBLIC by default, and anyone holding
    // the publishable key is `anon`. Without both revokes this helper is an
    // unauthenticated roster oracle.
    expect(migration).toContain('security definer');
    expect(migration).toMatch(/revoke all on function public\.golf_user_on_conversation_team\(\s*uuid, uuid\s*\) from public;/);
    expect(migration).toMatch(/revoke all on function public\.golf_user_on_conversation_team\(\s*uuid, uuid\s*\) from anon;/);
    expect(migration).toMatch(/grant execute on function public\.golf_user_on_conversation_team\(\s*uuid, uuid\s*\) to authenticated;/);
  });

  it('pins search_path on the helper', () => {
    expect(migration).toContain('set search_path = public, pg_temp');
  });

  it('never reads golf_conversation_participants inline — the recursion trap', () => {
    // A policy ON that table that reads it inline recurses, and Postgres then
    // fails EVERY query against the table, not just this branch. The helper
    // exists to avoid exactly that; the guard test is
    // src/test/schema/no-self-referencing-rls-policy.test.ts.
    const policyBody = migration.slice(migration.indexOf('create policy golf_participants_insert_v2'));
    expect(policyBody).not.toContain('from public.golf_conversation_participants');
  });
});

describe('membership — the RLS suite proves the policy, not just its text', () => {
  it('asserts both the new capabilities AND the refusals the widening must not touch', () => {
    expect(rlsSuite).toContain('the creator CAN add a teammate to a settled TEAM CHAT');
    expect(rlsSuite).toContain('the creator CANNOT add someone who is not on the conversation');
    expect(rlsSuite).toContain('2026-08-19 stays closed');
    expect(rlsSuite).toContain('the creator CAN remove another member from a team chat');
    expect(rlsSuite).toContain('a non-creator CANNOT delete the creator');
    expect(rlsSuite).toContain('"Leave group" is unchanged');
  });

  it('keeps the creation-order check a refusal-only suite would let rot', () => {
    // The trap 20260819070000's verification block names: a predicate that
    // blocks everything passes every refusal check. This is the pairing.
    expect(rlsSuite).toContain('conversation creation still works');
  });

  it('covers the creator who LEFT, and says plainly what that group cannot isolate', () => {
    expect(rlsSuite).toContain('a creator who has LEFT can no longer remove the members who stayed');
    // A third control run — that clause alone removed — still passes all
    // fourteen. Recording the limit is what keeps the suite honest; a reader
    // would otherwise take GROUP 4 for a test of the clause.
    expect(rlsSuite).toContain('ONE HONEST LIMIT');
  });

  it('takes its delete assertions with RLS OFF', () => {
    // Counting as the acting user cannot tell "the row is gone" from "the row
    // is invisible to me" — the same SELECT policy filters both. The suite's
    // first draft got a pass for the wrong reason on exactly this.
    expect(rlsSuite).toContain('RESET role;');
    expect(rlsSuite).toContain('THE COUNT IS TAKEN WITH RLS OFF');
  });
});

describe('membership — the server actions refuse rather than pretend', () => {
  it('records an RLS denial on every membership write path', () => {
    // Before the migration is applied these return 42501. Capturing it makes a
    // premature attempt a signal instead of a mystery toast.
    for (const action of [
      'messages.addGolfGroupMember',
      'messages.removeGolfGroupMember',
      'messages.leaveGolfGroup',
    ]) {
      expect(actions).toContain(action);
    }
    expect(actions).toContain('maybeCaptureRlsDenial');
  });

  it('treats a duplicate participant as success, not an error the user cannot act on', () => {
    expect(actions).toContain("error.code === '23505'");
  });

  it('routes self-removal to Leave group instead of Remove', () => {
    expect(actions).toContain('Use Leave group to remove yourself');
  });

  it('deletes by BOTH conversation_id and user_id', () => {
    // Either equality alone is a different statement: dropping the
    // conversation filter would remove that user from every conversation.
    const remove = actions.slice(actions.indexOf('async function removeGolfGroupMemberImpl'));
    const body = remove.slice(0, remove.indexOf('const observedRemoveGolfGroupMember'));
    expect(body).toContain(".eq('conversation_id', conversationId)");
    expect(body).toContain(".eq('user_id', userId)");
  });

  it('offers coaches as well as players as add candidates', () => {
    // getGolfTeamPlayersForBroadcast is players-only; reusing it would have
    // made assistant coaches silently unaddable.
    const impl = actions.slice(actions.indexOf('async function getGolfGroupAddCandidatesImpl'));
    expect(impl.slice(0, impl.indexOf('const observedGetGolfGroupAddCandidates'))).toContain(
      'golf_team_coach_staff',
    );
  });

  it('fails the candidate load when a ROSTER read fails, not just the participant read', () => {
    // Both roster reads run under the caller's RLS. On error `.data` is null,
    // both loops iterate zero times, and the sheet renders "Everyone on this
    // team is already in the group." — a failed read and a genuinely-full
    // group would be indistinguishable, and one of them means "try again".
    const impl = actions.slice(actions.indexOf('async function getGolfGroupAddCandidatesImpl'));
    const body = impl.slice(0, impl.indexOf('const observedGetGolfGroupAddCandidates'));
    expect(body).toContain('Failed to load the team roster');
    // Each error is named on its OWN identifier, not reached through a list.
    // `helm/no-unchecked-supabase-error` pairs `.data` with `.error` on the
    // same name and cannot see an indirection — the first version of this fix
    // used a loop, and the ratchet still counted both reads as unchecked.
    expect(body).toContain('if (members.error) {');
    expect(body).toContain('if (staff.error) {');
    expect(body).toContain("table: 'golf_team_members',");
    expect(body).toContain("table: 'golf_team_coach_staff',");
  });

  it('excludes people already in the group from the candidate list', () => {
    expect(actions).toContain('alreadyIn.has(');
  });
});

describe('membership — who the sheet offers the controls to', () => {
  it('derives the offer from creator === viewer, the same fact the Admin pill uses', () => {
    expect(sheetCode).toContain('const isCreator = Boolean(creatorId) && creatorId === currentUserId');
  });

  it('never offers Remove on the viewer\'s own row', () => {
    // The component's mirror of the policy's orphan guard: the creator leaving
    // is "Leave group", which has a different consequence.
    expect(sheetCode).toContain("canRemove={canManage && m.id !== currentUserId}");
  });

  it('requires the handlers to be supplied, so a read-only caller stays read-only', () => {
    expect(sheetCode).toContain('const canManage = isCreator && Boolean(onAddMember) && Boolean(onRemoveMember)');
  });

  it('shows Leave group to every member, not only the creator', () => {
    // Unlike Add and Remove, self-delete is permitted by production RLS today.
    expect(sheetCode).toContain('{!adding && onLeaveGroup && (');
  });

  it('surfaces a refusal in the sheet instead of failing silently', () => {
    expect(sheetCode).toContain('setError(result.error)');
    expect(sheetCode).toContain('text-fw-danger-ink');
  });

  it('confirms both destructive actions inline rather than in a stacked overlay', () => {
    // A second overlay above a Sheet is the z-index trap design-system.md
    // documents, and window.confirm blocks the WKWebView outright.
    expect(sheetCode).toContain('Remove?');
    expect(sheetCode).toContain('Leave this group?');
    expect(sheetCode).not.toContain('window.confirm');
  });

  it('clears every armed confirmation when the sheet closes', () => {
    // A confirmation left armed across close-and-reopen turns a mis-tap into
    // a removal.
    const effect = sheetCode.slice(sheetCode.indexOf('if (!open) {'));
    const body = effect.slice(0, effect.indexOf('}, [open]);'));
    expect(body).toContain('setRemoveConfirmId(null)');
    expect(body).toContain('setLeaveConfirm(false)');
    expect(body).toContain('setAdding(false)');
  });

  it('loads add candidates on open, never on mount', () => {
    expect(sheetCode).toContain('const openAdd = React.useCallback(');
    expect(sheetCode).toContain('if (!loadAddCandidates) return;');
  });

  it('applies the artboard\'s accent Add link on the MEMBERS baseline', () => {
    // `:80-82` — 12px / 500 in the accent, right-aligned on the heading's
    // baseline. Both sides measured.
    const add = artboard.match(
      /<span style="font-size: (\d+)px; font-weight: (\d+); color: oklch\(([^)]+)\);">Add<\/span>/,
    );
    expect(add, 'expected the artboard to draw an Add link').not.toBeNull();
    expect(add![1]).toBe('12');
    expect(add![2]).toBe('500');
    expect(typeStep('caption-1')).toContain("'12px'");
    expect(typeStep('caption-1')).toContain("fontWeight: '400'");
    expect(sheetCode).toContain('items-baseline justify-between');
    expect(sheetCode).toContain('text-caption-1 font-medium text-accent-700');
  });

  it('keeps Leave group readable in a compact full-width row', () => {
    expect(sheetCode).toContain('h-12 w-full rounded-fw-md bg-surface');
    expect(sheetCode).toContain('text-subhead font-medium text-fw-danger-ink');
  });
});

describe('membership — the page hands the sheet server actions, not local state', () => {
  it('refetches after every mutation instead of patching the member map', () => {
    // `groupParticipants` and the header's "N members" come from the same
    // rows. Patching one locally lets them disagree for as long as the sheet
    // stays open — the disagreement W7 removed.
    expect(pageCode).toContain('await fetchGroupParticipants(selectedConversation.id)');
    const add = pageCode.slice(pageCode.indexOf('onAddMember={'));
    expect(add.slice(0, add.indexOf('onRemoveMember='))).toContain('await refetch()');
  });

  it('deselects the conversation on leave', () => {
    // The participant row is gone, so the thread cannot keep rendering.
    const leave = pageCode.slice(pageCode.indexOf('onLeaveGroup={'));
    expect(leave.slice(0, leave.indexOf('loadAddCandidates='))).toContain(
      'setSelectedConversationId(null)',
    );
  });
});
