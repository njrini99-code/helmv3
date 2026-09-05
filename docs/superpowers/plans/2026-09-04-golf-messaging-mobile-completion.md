# Golf Messaging Mobile Completion Implementation Plan

<!-- markdownlint-disable MD013 -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a premium, reliable GolfHelm mobile Messaging experience with a people-first inbox, full-screen threads, instant recoverable send, and player-created private groups.

**Architecture:** Retain the mature realtime and native-scroll implementation, but give mobile a flat, people-first presentation through the existing Fairway message components. Extend the existing, team-audience-validated conversation action with an optional private-group title; no schema migration or permission expansion is required. Preserve desktop’s two-pane composition while mobile switches between a full inbox and a full conversation canvas.

**Tech Stack:** Next.js/React, TypeScript, Supabase server actions/RLS, Fairway primitives, Framer Motion, NumberFlow, Capacitor haptics/keyboard, Vitest, Testing Library, Playwright.

**Spec:** [2026-09-04-golf-messaging-mobile-completion-design.md](../specs/2026-09-04-golf-messaging-mobile-completion-design.md)

## Global Constraints

- Use Fairway tokens and primitives; do not add a chat UI kit, animation library, drawer library, migration, or permission expansion.
- Keep message history native overflow scrolling. Do not use Lenis or GSAP for core chat motion.
- Use PressTarget for custom rows/actions, real Avatar/AvatarGroup identity, SearchField for discovery, and Sheet for creation/attachment flows.
- Historic messages use AnimatePresence initial=false and list motion uses layout="position"; all motion must be reduced-motion safe.
- A failed text send remains in the thread and owns its retry state. The composer clears in the same interaction and never shows a normal-send spinner.
- Player groups must use the existing server-side team-audience validation. Coach Team channel remains a distinct official action.
- Update feature current-state documentation. Do not call browser evidence physical-device verification.

---

### Task 1: Preserve send failure and validate reply boundaries

**Files:**

- Modify: `src/hooks/golf/use-golf-messages.ts:704-725`
- Modify: `src/app/actions/messages.ts:97-168,268-374,648-660`
- Modify: `src/app/golf/actions/messages.ts:createGolfConversation wrapper`
- Modify: `src/lib/validation/action-schemas.ts:72-101`
- Modify: `src/hooks/golf/__tests__/use-golf-messages.send-integrity.test.ts`
- Modify: `src/app/golf/actions/__tests__/messages-create-golf-conversation.test.ts`
- Create: `src/app/actions/__tests__/messages-reply-boundary.test.ts`

**Interfaces:**

- Consumes: `sendGolfMessage(conversationId, content, clientMessageId?, replyToId?)`.
- Produces: `createGolfConversation(participantUserIds, teamId?, title?)`; title is an optional trimmed 1–80 character group title.
- Produces: replies accepted only when the target belongs to the same conversation and is not deleted.

- [ ] **Step 1: Write failing tests**

Add this regression to the existing send-integrity test:

~~~ts
it('marks a server-returned error failed without filtering the optimistic row away', () => {
  const start = source.indexOf('const sendMessage = async');
  const end = source.indexOf('// Edit a message', start);
  const send = source.slice(start, end);
  expect(send).toContain('markSendFailed(optimisticId)');
  expect(send).not.toContain('prev.filter(m => m.id !== optimisticId)');
});
~~~

Add `messages-reply-boundary.test.ts` using a signed-in participant fake with three cases: same-thread live target succeeds; another-thread target rejects `Reply message is unavailable`; deleted target rejects the same safe error. Extend the Golf wrapper test to expect an optional group title to be forwarded.

- [ ] **Step 2: Run tests to verify failure**

Run:

~~~bash
npx vitest run src/hooks/golf/__tests__/use-golf-messages.send-integrity.test.ts src/app/actions/__tests__/messages-reply-boundary.test.ts src/app/golf/actions/__tests__/messages-create-golf-conversation.test.ts
~~~

Expected: send regression and reply cases fail before implementation.

- [ ] **Step 3: Implement the smallest secure change**

Replace the destructive branch in the hook:

~~~ts
if (result && 'error' in result && result.error) {
  markSendFailed(optimisticId);
  throw new Error(result.error);
}
~~~

After participant validation in `sendMessage`, and before inserting a Golf message, query the reply row through caller RLS:

~~~ts
if (sport === 'golf' && validatedData.reply_to_id) {
  const { data: replyTarget, error: replyError } = await supabase
    .from('golf_messages')
    .select('id')
    .eq('id', validatedData.reply_to_id)
    .eq('conversation_id', validatedData.conversation_id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (replyError || !replyTarget) throw new Error('Reply message is unavailable');
}
~~~

Add `MessageSchemas.conversation_title`, add `title?: string` to generic and Golf creation action signatures, validate only a supplied title, and insert it only for Golf. Do not set `is_team_chat` in the private-group path.

- [ ] **Step 4: Verify targeted tests pass**

Run the command from Step 2. Expected: all pass, including existing audience validation.

- [ ] **Step 5: Commit**

~~~bash
git add src/hooks/golf/use-golf-messages.ts src/app/actions/messages.ts src/app/golf/actions/messages.ts src/lib/validation/action-schemas.ts src/hooks/golf/__tests__/use-golf-messages.send-integrity.test.ts src/app/actions/__tests__/messages-reply-boundary.test.ts src/app/golf/actions/__tests__/messages-create-golf-conversation.test.ts
git commit -m "fix(golf/messages): preserve failed sends and validate replies"
~~~

### Task 2: Position a mobile thread only after it becomes visible

**Files:**

- Modify: `src/components/fairway/pages/messages/FairwayMessages.tsx`
- Modify: `src/components/fairway/pages/messages/MessageThreadPane.tsx:155-223,787-841`
- Modify: `src/components/fairway/pages/messages/MessageThreadPane.scroll.test.ts`

**Interfaces:**

- Produces: `MessageThreadPaneProps.threadVisible: boolean`.
- `threadVisible` is true when desktop is active or the mobile thread is shown.
- A hidden or zero-height thread retains, rather than consumes, its initial scroll sentinel.

- [ ] **Step 1: Write the hidden-to-visible regression**

Render a selected thread with `threadVisible: false`, `scrollHeight = 640`, and `clientHeight = 0`. Rerender with `threadVisible: true` and `clientHeight = 180`:

~~~ts
expect(scrollContainer.scrollTop).not.toBe(640);
rerender(createElement(MessageThreadPane, { ...props, loading: false, threadVisible: true }));
expect(scrollContainer.scrollTop).toBe(640);
~~~

- [ ] **Step 2: Run it to verify failure**

~~~bash
npx vitest run src/components/fairway/pages/messages/MessageThreadPane.scroll.test.ts
~~~

Expected: prior behaviour consumes the sentinel while hidden.

- [ ] **Step 3: Implement visibility-aware initial positioning**

In `FairwayMessages`, calculate:

~~~ts
const isDesktopMessages = useMediaQuery('(min-width: 768px)');
const threadVisible = isDesktopMessages || mobileShowChat;
~~~

Pass it to `MessageThreadPane`. In the initial `useLayoutEffect`, do not clear the pending sentinel if `!threadVisible`, the scroll container is absent, or `clientHeight <= 0`. Depend on `threadVisible`. Leave search-result anchoring, late-growth pinning, keyboard resize, image-load pinning, and near-bottom rules intact.

- [ ] **Step 4: Verify pass**

Run the command from Step 2. Expected: group opening, keyboard, history, search target, and hidden-to-visible tests all pass.

- [ ] **Step 5: Commit**

~~~bash
git add src/components/fairway/pages/messages/FairwayMessages.tsx src/components/fairway/pages/messages/MessageThreadPane.tsx src/components/fairway/pages/messages/MessageThreadPane.scroll.test.ts
git commit -m "fix(golf/messages): position mobile threads after visibility"
~~~

### Task 3: Build direct and private-group creation

**Files:**

- Modify: `src/components/fairway/pages/messages/FairwayNewMessageSheet.tsx`
- Modify: `src/components/fairway/pages/messages/FairwayNewMessageSheet.test.tsx`
- Modify: `src/components/fairway/pages/messages/FairwayMessages.tsx`
- Modify: `src/components/fairway/pages/messages/FairwayTeamBroadcastSheet.tsx`

**Interfaces:**

- Consumes: `onCreateConversation(participantUserIds: string[], title?: string): Promise<void>`.
- Produces: direct mode requiring one recipient, and group mode requiring at least two recipients plus a nonblank title.
- Coach Team channel remains coach-only and labelled official.

- [ ] **Step 1: Write failing group-picker tests**

Export:

~~~ts
export function canCreateConversation(
  mode: 'direct' | 'group',
  selectedUserIds: string[],
  title: string,
) {
  return mode === 'direct'
    ? selectedUserIds.length === 1
    : selectedUserIds.length >= 2 && title.trim().length > 0;
}
~~~

Test direct one-recipient acceptance, group rejection for one recipient and blank title, and group acceptance for two recipients plus title. Assert that the sheet imports `SearchField`, uses `PressTarget` rows, and no generic `Input` remains.

- [ ] **Step 2: Run it to verify failure**

~~~bash
npx vitest run src/components/fairway/pages/messages/FairwayNewMessageSheet.test.tsx
~~~

Expected: missing helper and primitive assertions fail.

- [ ] **Step 3: Implement the unified Sheet**

Replace `onSelect(userId)` with `onCreateConversation(userIds, title?)`. Preserve the existing recipient query, team scope, deduplication, error states, and mobile autofocus rule. Add Direct/Group `SelectablePill` controls, recipient multiselect, a selected `AvatarGroup` strip, group-title field, and a mode-specific primary action: `Start message` or `Create group`.

In `FairwayMessages`, call the updated, server-validated action, refetch, select the created conversation, and only show success after resolution. Replace custom raw recipient buttons in the coach sheet with `PressTarget` but preserve official channel semantics.

- [ ] **Step 4: Verify tests pass**

~~~bash
npx vitest run src/components/fairway/pages/messages/FairwayNewMessageSheet.test.tsx src/app/golf/actions/__tests__/messages-create-golf-conversation.test.ts
~~~

- [ ] **Step 5: Commit**

~~~bash
git add src/components/fairway/pages/messages/FairwayNewMessageSheet.tsx src/components/fairway/pages/messages/FairwayNewMessageSheet.test.tsx src/components/fairway/pages/messages/FairwayMessages.tsx src/components/fairway/pages/messages/FairwayTeamBroadcastSheet.tsx
git commit -m "feat(golf/messages): let teammates create private groups"
~~~

### Task 4: Finish people-first inbox, thread identity, and composer surfaces

**Files:**

- Modify: `src/components/fairway/pages/messages/MessageConversationRail.tsx`
- Modify: `src/components/fairway/pages/messages/MessageConversationRail.test.tsx`
- Modify: `src/components/fairway/pages/messages/MessageComposer.tsx`
- Modify: `src/components/fairway/pages/messages/MessageComposer.enterKey.test.tsx`
- Modify: `src/components/fairway/pages/messages/MessageThreadPane.tsx`

**Interfaces:**

- Retains current data query, attachment, typing, reply, haptic, and desktop two-pane contracts.
- Produces: SearchField inbox search, PressTarget search rows, real group identity in the header, and a native textarea Fairway composer.

- [ ] **Step 1: Write failing visual contract tests**

In the rail test:

~~~ts
expect(source).toContain("from '@/components/fairway/command/search-field'");
expect(source).toContain('<SearchField');
expect(searchResultSource).toContain('<PressTarget');
expect(source).not.toContain("from '@/components/fairway/forms/Input'");
~~~

In the composer test, assert one native textarea and Fairway controls, while forbidding imports from `@/components/ui/button` and `@/components/ui/input`. Retain fine-pointer Enter-to-send and touch-keyboard newline tests.

- [ ] **Step 2: Run to verify failure**

~~~bash
npx vitest run src/components/fairway/pages/messages/MessageConversationRail.test.tsx src/components/fairway/pages/messages/MessageComposer.enterKey.test.tsx
~~~

Expected: legacy input/button imports and search-result Button cause failure.

- [ ] **Step 3: Implement the visual finish**

Use controlled `SearchField size="md"` with clear support in the rail, and `PressTarget` for cross-conversation search hits. Every mobile loading, empty, error, and loaded branch remains flat canvas; desktop retains the actual panel.

Replace the generic textarea/button pair with a native textarea and Fairway `PressTarget`/`IconButton` composition. Retain auto-grow, 5,000-character enforcement, typing throttle, attachment preview, same-tick clearing, 44px hit targets, reply strip, and touch-keyboard newline. Replace raw RGBA shadow with an existing token-safe treatment.

For group header identity, use available participant faces through `AvatarGroup` with a deliberate initials fallback. Do not add GlassSurface to bubbles/rows/composer.

- [ ] **Step 4: Verify pass**

~~~bash
npx vitest run src/components/fairway/pages/messages/MessageConversationRail.test.tsx src/components/fairway/pages/messages/MessageComposer.enterKey.test.tsx src/components/fairway/pages/messages/MessageThreadPane.scroll.test.ts
~~~

- [ ] **Step 5: Commit**

~~~bash
git add src/components/fairway/pages/messages/MessageConversationRail.tsx src/components/fairway/pages/messages/MessageConversationRail.test.tsx src/components/fairway/pages/messages/MessageComposer.tsx src/components/fairway/pages/messages/MessageComposer.enterKey.test.tsx src/components/fairway/pages/messages/MessageThreadPane.tsx
git commit -m "feat(golf/messages): finish people-first mobile messaging UI"
~~~

### Task 5: Render actual components and update feature truth

**Files:**

- Create or extend: existing real-component message screenshot harness discovered in this branch
- Create: `docs/qa/golf-messaging-mobile-2026-09-04/README.md`
- Modify: `memory/features/team-communications.md`
- Modify: generated knowledge outputs only if the owning command reports drift

**Interfaces:**

- Consumes: real Messaging React components with deterministic fixture data.
- Produces: component-rendered screenshots for inbox, group thread, failed send, and private group creation; no hand-written HTML approximation.
- Produces: documented verified browser evidence and explicit outstanding physical-iPhone limitation.

- [ ] **Step 1: Identify and extend the existing render harness**

Locate the harness in this branch with:

~~~bash
rg -n "renderToStaticMarkup|react-dom/server|screenshot" scripts src test
~~~

Add four deterministic fixtures: `inbox-unread-group`, `thread-short-group`, `thread-failed-send`, and `new-private-group`. Include long names/titles, real avatar stacks, unread state, grouped bubbles, reply/failed metadata, and composer.

- [ ] **Step 2: Render at mobile widths and assert overflow**

Run the harness at 320, 390, and 430px. In its real browser page assert:

~~~ts
document.documentElement.scrollWidth <= document.documentElement.clientWidth
~~~

Save PNGs and a manifest under `docs/qa/golf-messaging-mobile-2026-09-04/`; visually inspect every output.

- [ ] **Step 3: Update current-state documentation**

Record private group creation, same-team enforcement, visibility-aware opening, failed-send persistence, reply-boundary validation, exact render command/path, and that physical iPhone QA has not run.

- [ ] **Step 4: Run release gates**

~~~bash
npx vitest run src/components/fairway/pages/messages src/hooks/golf/__tests__/use-golf-messages.send-integrity.test.ts src/app/actions/__tests__/messages-reply-boundary.test.ts src/app/golf/actions/__tests__/messages-create-golf-conversation.test.ts
npm run typecheck
npm run lint
npm run knowledge:check
npm run build
npm run test:e2e -- e2e/messages.spec.ts
~~~

Expected: every command exits zero. Repair causes and rerun affected gates; cancelled/unavailable browser work is not a pass.

- [ ] **Step 5: Commit documentation and evidence**

~~~bash
git add memory/features/team-communications.md docs/qa/golf-messaging-mobile-2026-09-04
git add docs/generated memory
git commit -m "docs(golf/messages): record mobile messaging completion"
~~~

Stage only files changed by this work.

### Task 6: Update PR #1833 and merge after green checks

**Files:**

- Modify: PR #1833 description/checklist

**Interfaces:**

- Consumes: implementation commits, generated visual evidence, and completed gates.
- Produces: an updated existing PR (not a duplicate) that truthfully records browser and device evidence.

- [ ] **Step 1: Push the branch and update the existing PR**

~~~bash
git push origin agent/messages-instant-entry
gh pr edit 1833 --body-file /tmp/golf-messaging-pr-body.md
~~~

The body identifies the new group capability, integrity repairs, visual-proof path, passed checks, no production migration action, and any remaining physical-device limitation.

- [ ] **Step 2: Wait for all GitHub checks**

~~~bash
gh pr view 1833 --json state,mergeStateStatus,statusCheckRollup,url
~~~

Expected: open, mergeable, and all required checks completed successfully.

- [ ] **Step 3: Merge and independently verify main**

~~~bash
gh pr merge 1833 --squash --delete-branch
git fetch origin main
git log -1 --oneline origin/main
~~~

Do not deploy or promote production; merging and production release are separate actions.
