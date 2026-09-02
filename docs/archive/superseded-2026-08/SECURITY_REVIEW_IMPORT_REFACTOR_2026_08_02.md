# Security Review: Import Refactor (teams.ts → decision-room.ts)

**Date**: 2026-08-02  
**Reviewer**: Security Analysis  
**Branch**: fix/deepsec-wave2-security  
**Status**: ✅ APPROVED - No security regression

---

## Executive Summary

This refactor moves direct imports of server actions from `src/app/baseball/actions/teams.ts` (re-exports) to `src/app/baseball/actions/decision-room.ts` (original definitions). 

**Security Verdict**: **SECURE** ✓

All authentication, authorization, and data-scoping checks remain intact and server-enforced. The location of imports/re-exports does not affect the security model. This is a safe, mechanical refactor.

---

## Affected Functions

Seven functions moved from re-export chains to direct imports:

1. `getDecisionRoomData` — Read model for Staff Decision Room
2. `getStaffSettingsData` — Read model for Staff Settings  
3. `recordDecisionNote` — Append note to decision ledger
4. `markMeetingItemDiscussed` — Mark agenda item discussed
5. `reopenMeetingItem` — Reopen resolved item
6. `resolveMeetingItem` — Resolve item with note
7. `createMeetingItem` — Create staff agenda item

Affected consumers:
- `src/app/baseball/(dashboard)/dashboard/decision-room/page.tsx`
- `src/app/baseball/(dashboard)/dashboard/settings/staff/page.tsx`
- `src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx`
- `src/components/baseball/staff/StaffSettingsClient.tsx`

---

## Security Architecture

### Authentication Layers

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **Page entry** | `createClient().auth.getUser()` + redirect to `/baseball/login` if missing | ✅ ENFORCED |
| **Action wrapper** | `withBaseballAction()` resolves auth user; throws 401 if missing | ✅ ENFORCED |
| **Database** | RLS policies enforce authenticated-only access to tables | ✅ ENFORCED |

### Authorization Model

All mutation functions wrap with `withBaseballAction(requiredCapability: 'can_manage_settings')`:

```typescript
export const markMeetingItemDiscussed = withBaseballAction(
  'markMeetingItemDiscussed',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',  // ← Enforced server-side
  },
  async (ctx, itemId: string): Promise<DecisionRoomMutationResult> => {
    // ctx.targetTeamId is server-resolved, never from client
    const supabase = (await createClient()) as unknown as LooseClient;
    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({...})
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);  // ← Server-resolved scoping
    // ...
  },
);
```

**How `withBaseballAction` protects**:
1. Authenticates user (throws 401 if none)
2. Resolves active baseball team via `getActiveBaseballContext()` (validates membership against database)
3. Enforces capability via `requireBaseballCapability()` (checks staff permissions)
4. Only then passes `ctx` to function body

### Data Scoping

All team-scoped queries use `ctx.targetTeamId` (server-resolved, never from client):

| Table | Queries | Scoping | Leak Risk |
|-------|---------|---------|-----------|
| `baseball_meeting_items` | Read/write agenda items | `.eq('team_id', ctx.targetTeamId)` | ✅ NONE |
| `baseball_decision_log` | Insert decision records | `team_id: ctx.targetTeamId` | ✅ NONE |
| `baseball_actions` | Via delegated conversion | Delegated to `convertSignalToAction()` | ✅ NONE |

---

## Function-by-Function Security Analysis

### ✅ getDecisionRoomData (Confidence: 10/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:364-466`

```typescript
export async function getDecisionRoomData(): Promise<DecisionRoomData> {
  const inner = withBaseballAction(
    'getDecisionRoomData',
    {
      featureArea: 'baseball-decision-room',
      requiredCapability: 'can_manage_settings',  // ← Step 1: Capability enforced
    },
    async (ctx): Promise<DecisionRoomData> => {
      const supabase = await createClient();
      const teamId = ctx.targetTeamId;  // ← Step 2: Server-resolved team
      
      // Step 3: Conditional gating on can_view_readiness
      const caps = await resolveBaseballCapabilities(teamId);
      const canViewReadiness = caps.can_view_readiness || caps.is_head_coach;
      
      // Honest empty values if denied
      const EMPTY_AVAILABILITY: DecisionRoomAvailabilityConcern[] = [];
      // ...
      return {
        agenda,
        // ... all scoped to teamId
        readinessWithheld: !canViewReadiness,
      };
    },
  );
  return inner();
}
```

**Security Properties**:
- ✅ Capability gated on `can_manage_settings`
- ✅ Team context server-resolved via `getActiveBaseballContext()`
- ✅ Secondary gate: availability/readiness data conditionally withheld on `can_view_readiness`
- ✅ Honest empty arrays returned (not fabricated "all clear" message)

**Verdict**: SECURE

---

### ✅ getStaffSettingsData (Confidence: 9/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:911-924`

```typescript
async function getStaffSettingsDataImpl(): Promise<StaffSettingsData> {
  const supabase = await createClient();
  const context = await getActiveBaseballContext();  // ← Validates membership
  if (!context) {
    return { staff: [], invitations: [], canManageStaff: false };
  }
  return loadStaffSettings(supabase, context.activeTeamId);
}

export const getStaffSettingsData = withAdminObserved(
  'getStaffSettingsData',
  { sport: 'baseball', feature: 'baseball_decision_room', featureArea: 'baseball-decision-room' },
  getStaffSettingsDataImpl,
);
```

**Security Properties**:
- ✅ Uses `getActiveBaseballContext()` which validates team membership against database
- ✅ Wrapped in `withAdminObserved()` for observability (auth still enforced via impl)
- ⚠️ Does NOT enforce `can_manage_settings` capability (see note below)
- ✅ Honest empty result if no active context

**Note on capability**: This is a READ-only function. Any staff member on a team should be able to see the staff roster. If the product requirement is that only heads/managers can view staff, this should be gated. Currently accepts all staff members. **This is not a regression from the refactor** — it's an existing design choice. Recommend verifying with product.

**Verdict**: SECURE (with note on capability scope)

---

### ✅ markMeetingItemDiscussed (Confidence: 10/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:503-542`

```typescript
export const markMeetingItemDiscussed = withBaseballAction(
  'markMeetingItemDiscussed',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (ctx, itemId: string): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({...})
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);  // ← Server-resolved team scoping
    // ...
  },
);
```

**Security Properties**:
- ✅ Capability enforced via `withBaseballAction`
- ✅ Query scoped to `ctx.targetTeamId` (server-resolved)
- ✅ Minimal parameter: only `itemId` (string), no injection vectors

**Verdict**: SECURE

---

### ✅ reopenMeetingItem (Confidence: 10/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:548-590`

**Security Properties**: Identical to `markMeetingItemDiscussed`
- ✅ Capability enforced
- ✅ Team scoped via `ctx.targetTeamId`
- ✅ Safe parameter passing

**Verdict**: SECURE

---

### ✅ resolveMeetingItem (Confidence: 10/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:597-642`

```typescript
export const resolveMeetingItem = withBaseballAction(
  'resolveMeetingItem',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: { itemId: string; resolution: string },  // ← User-supplied resolution text
  ): Promise<DecisionRoomMutationResult> => {
    // ...
    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({
        status: 'resolved',
        resolution: args.resolution,  // ← Stored as plaintext, no injection
        resolved_at: now,
        resolved_by: ctx.user.id,
        updated_at: now,
      })
      .eq('id', args.itemId)
      .eq('team_id', ctx.targetTeamId);
  },
);
```

**Security Properties**:
- ✅ Capability enforced
- ✅ Team scoped
- ✅ User-supplied `resolution` text stored as plaintext (no SQL injection risk, appropriate for plaintext column)

**Verdict**: SECURE

---

### ⚠️ createMeetingItem (Confidence: 9/10 - SECURE WITH MINOR NOTE)

**File**: `src/app/baseball/actions/decision-room.ts:648-675`

```typescript
export const createMeetingItem = withBaseballAction(
  'createMeetingItem',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: { title: string; detail: string | null },  // ← User input, no length limits in action
  ): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error } = await supabase.from('baseball_meeting_items').insert({
      team_id: ctx.targetTeamId,
      title: args.title,
      detail: args.detail ?? null,
      status: 'open',
      created_by: ctx.user.id,
    });
  },
);
```

**Security Properties**:
- ✅ Capability enforced
- ✅ Team scoped to `ctx.targetTeamId`
- ✅ User input properly isolated (no injection vectors)
- ⚠️ No server-side validation on `title` or `detail` length

**Note**: Client validates `title.trim()` in `StaffDecisionRoomClient.tsx:79`, but action does not. This is a UX issue (unbounded storage) not a security issue. **Not a regression from this refactor** — pre-existing.

**Verdict**: SECURE (with recommendation to add server-side length validation in a follow-up)

---

### ⚠️ recordDecisionNote (Confidence: 9/10 - SECURE WITH CONTROLLED RISK)

**File**: `src/app/baseball/actions/decision-room.ts:681-729`

```typescript
export const recordDecisionNote = withBaseballAction(
  'recordDecisionNote',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: {
      title: string;
      note: string;
      subjectTable: string;              // ← USER-SUPPLIED: KEY PARAMETER
      subjectId: string;
      sourceSignalId: string | null;
      playerId: string | null;
    },
  ): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    // USER CONTROLS THIS ROUTING LOGIC
    const meetingItemId =
      args.subjectTable === 'baseball_meeting_items' ? args.subjectId : null;
    const signalId =
      args.subjectTable === 'baseball_signals'
        ? args.subjectId
        : (args.sourceSignalId ?? null);

    const { error } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'note',
      title: args.title,
      detail: args.note,
      meeting_item_id: meetingItemId,   // ← Controlled by subjectTable
      signal_id: signalId,              // ← Controlled by subjectTable
      player_id: args.playerId ?? null,
      decided_by: ctx.user.id,
    });
  },
);
```

**Security Analysis**:

The `subjectTable` parameter controls routing to database columns:
- If `subjectTable === 'baseball_meeting_items'` → `meetingItemId` = `subjectId`
- If `subjectTable === 'baseball_signals'` → `signalId` = `subjectId`
- Otherwise → both `meetingItemId` and `signalId` = null (safe fallthrough)

**Risk Assessment**:
- ✅ Whitelist pattern: unrecognized strings safely null out
- ✅ Team scoped via `ctx.targetTeamId`
- ⚠️ Future extensibility risk: if code adds new branches without validation, it could become a logic vector

**Current State**: SAFE (whitelist pattern contains risk)

**Recommendation**: Narrow `subjectTable` to a union type or enum:
```typescript
type SubjectTable = 'baseball_meeting_items' | 'baseball_signals';
args: {
  ...
  subjectTable: SubjectTable;  // Type-enforced, not string
  ...
}
```

**Verdict**: SECURE (with recommendation for type hardening)

---

### ✅ convertSignalToPracticeBlock (Confidence: 10/10 - SECURE)

**File**: `src/app/baseball/actions/decision-room.ts:746-832`

```typescript
export const convertSignalToPracticeBlock = withBaseballAction(
  'convertSignalToPracticeBlock',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: {
      signalId: string;
      title: string;
      detail: string | null;
    },
  ): Promise<DecisionRoomMutationResult> => {
    // PRE-CHECK: dual capability enforcement
    const canPractice = await hasBaseballCapability(
      ctx.targetTeamId,
      'can_manage_practice',
    );
    if (!canPractice) {
      return {
        success: false,
        error: 'You do not have permission to create practice blocks.',
      };
    }

    // Delegate to canonical signals engine
    const convertResult = await convertSignalToAction({
      signalId: args.signalId,
      actions: [
        {
          actionType: 'practice_block',
          title: args.title,
          detail: args.detail ?? null,
          visibility: 'staff_only',
        },
      ],
    });
    // ...
  },
);
```

**Security Properties**:
- ✅ Primary capability: `can_manage_settings` (via wrapper)
- ✅ Secondary pre-check: `can_manage_practice` (before delegation)
- ✅ Dual capability enforcement is well-designed
- ✅ Delegates to already-scoped `convertSignalToAction()`
- ✅ Team context inherited from wrapper

**Verdict**: SECURE (exemplary dual-gate pattern)

---

## Import Path Security

### Before (Re-export chain)
```typescript
// teams.ts
export const getDecisionRoomData = ...; // Re-exported
export const getStaffSettingsData = ...; // Re-exported
export const markMeetingItemDiscussed = ...; // Re-exported
// ... etc

// Consumer
import { getDecisionRoomData } from '@/app/baseball/actions/teams';
```

### After (Direct import)
```typescript
// decision-room.ts
export const getDecisionRoomData = ...; // Defined here

// Consumer
import { getDecisionRoomData } from '@/app/baseball/actions/decision-room';
```

**Security Impact Analysis**:
- ✅ No change to auth execution path
- ✅ No change to capability checking
- ✅ No change to team context resolution
- ✅ No change to RLS enforcement
- ✅ Import path is purely organizational — security is enforced inside the action

**Verdict**: SEMANTICALLY IDENTICAL from security perspective

---

## Verification Checklist

- ✅ All mutations wrapped with `withBaseballAction(requiredCapability: ...)`
- ✅ All reads use server context resolution (`getActiveBaseballContext()`)
- ✅ All queries scoped to server-resolved team ID, never client-supplied
- ✅ Page components have upfront auth checks (`auth.getUser()`)
- ✅ No new auth bypass vectors introduced
- ✅ No privilege escalation paths opened
- ✅ RLS remains the backstop for all database access
- ✅ Input validation gaps pre-exist the refactor (not introduced)
- ✅ Type safety improvements possible but not required for security

---

## Pre-Existing Notes (Not Regressions)

### 1. Input Validation Gaps

**Affected functions**: `createMeetingItem`, `recordDecisionNote`

**Issue**: No server-side length validation on user-supplied text

**Impact**: Unbounded plaintext storage (UX/storage issue, not security)

**Status**: Pre-existing, not introduced by this refactor

**Action**: File a separate ticket for server-side validation

---

### 2. getStaffSettingsData Capability Scope

**Issue**: Does not enforce `can_manage_settings` — all staff members can view staff roster

**Status**: Likely intentional (read-only), but should be verified

**Action**: Confirm product requirement; not a regression

---

### 3. subjectTable Type Safety

**Issue**: `recordDecisionNote` accepts `subjectTable` as string, not narrowed union

**Status**: Whitelist pattern is safe currently; future extensibility risk

**Action**: Recommend narrowing to union type in follow-up refactor

---

## Conclusion

✅ **VERDICT: APPROVED FOR MERGE**

**Security Assessment**: No regressions. All authentication, authorization, and data-scoping checks remain intact and server-enforced.

**Key Reasons**:
1. Import location does not affect execution path
2. `withBaseballAction` wrapper still runs and enforces capability checks
3. `ctx.targetTeamId` is still server-resolved
4. RLS is still the backstop
5. Page-level auth gates are still in place

**Recommendation**: Proceed with merge. Consider filing follow-up tickets for:
- Server-side length validation in `createMeetingItem`
- Type narrowing of `subjectTable` in `recordDecisionNote`
- Capability scope verification for `getStaffSettingsData`

---

## References

- `/src/app/baseball/actions/decision-room.ts` — Source file
- `/src/lib/baseball/with-baseball-action.ts` — Auth wrapper implementation
- `/src/lib/baseball/active-context.ts` — Team context resolution
- `/src/app/baseball/(dashboard)/dashboard/decision-room/page.tsx` — Consumer page
- `/src/app/baseball/(dashboard)/dashboard/settings/staff/page.tsx` — Consumer page
