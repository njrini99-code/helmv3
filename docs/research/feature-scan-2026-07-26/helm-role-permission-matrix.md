# Helm Role–Permission Matrix

**Research date:** 2026-07-26  
**Layers compared:** Intended · UI · Server Action · RLS  
**Values:** V=View · C=Create · E=Edit · D=Delete · M=Manage · N=No · P=Partial · ?=Unknown

---

## 1. Role inventory

| Role ID | Storage | Product | Notes |
|---------|---------|---------|-------|
| `anon` | none | all | Marketing, join entry, public baseball packets |
| `authed_incomplete` | `users` without sport profile complete | all | Forced to onboarding |
| `golf_player` | `golf_players` + `golf_team_members` | golf | |
| `golf_coach` | `golf_coaches` | golf | Prefer if dual profiles |
| `golf_head_coach` | `golf_team_coach_staff.role=head_coach` | golf | Team switch, stronger RLS |
| `golf_assistant_coach` | staff role text | golf | Staffed; cannot switch teams |
| `golf_admin` | `users.role=admin` | `/golf/admin` | CRM |
| `super_admin` | `SUPER_ADMIN_USER_IDS` / allowlist | `/admin` | Helm Bridge |
| `baseball_player` | `baseball_players` + members | baseball | Player access matrix |
| `baseball_staff` | `baseball_team_coach_staff` + capability bools | baseball | Fine-grained caps |
| `baseball_head_coach` | `is_head_coach` / primary | baseball | All caps |
| `lifting_coach` | `helm_lifting_coaches` + assignments | lifting | |
| `lifting_athlete` | `helm_lifting_athletes` | lifting | |
| `lifting_org_viewer` | `helm_lifting_org_viewers` | lifting | Read |
| `guardian` | program settings flags | baseball | Settings exist; login role unclear |
| `crm_lead` | `crm_coaches` | admin CRM | Not an app login role |
| `trial/paid` | N/A product | — | **No product billing entitlements** |
| `demo_visitor` | demo_sessions | golf/baseball | Shared demo coach |

Evidence: session.ts, golf layout, baseball capabilities.ts, admin layout, player-access.ts.

---

## 2. Golf matrix (selected features)

| Feature | Player | Assist coach | Head coach | Golf admin | Anon |
|---------|--------|--------------|------------|------------|------|
| Dashboard home | V | V | V | N* | N |
| Enter round | C | N | N | N | N |
| View team roster | V | V | V/M | — | N |
| Remove player | N | P? | M | — | N |
| Create qualifier | N | P? | C | — | N |
| Team stats | N | V | V | — | N |
| Intelligence Brief | N | V | V | — | N |
| Ask + Confirm writes | N | V/C† | V/C† | — | N |
| Coaching philosophy | N | E? | E | — | N |
| Switch team | N | N | M | — | N |
| Messaging | V/C | V/C | V/C | — | N |
| Join via code | C | — | — | — | entry |
| `/golf/admin` CRM | N | N | N | M | N |

\* Golf admin may lack golf profile → special layout path.  
† Write tools gated by Confirm + coach session; staff vs head not re-checked inside every tool beyond team roster cookie — **gap risk** (see risks).  
? Assistant write breadth: **Tentative** — golf lacks baseball-style capability map; many pages only check “is coach”.

### Layer disagreement — Golf

| Topic | UI | Server | RLS | Gap |
|-------|----|--------|-----|-----|
| Coach vs player pages | Redirect / FeatureUnavailable | Profile checks in pages/actions | `is_golf_team_*` helpers | Medium: middleware does not enforce golf roles |
| Head vs assistant | Team switcher hidden | Switcher enforces head | Head-specific policies for some writes | **High test value:** assistant calling head-only actions |
| Insight visibility | Filtered in delivery | `applyInsightVisibility` | Ownership only, no lifecycle filter | App-layer only — Confirmed |
| Service role generators | N/A | Admin client writes insights | Bypass | Must not be callable from client |

---

## 3. Baseball matrix (capability-driven)

Capabilities (from `capabilities.ts`):  
`can_manage_roster`, `can_manage_practice`, `can_manage_lifting`, `can_manage_lineups`, `can_view_academics`, `can_manage_imports`, `can_manage_stats`, `can_invite_staff`, `can_manage_settings`, `can_view_readiness`, `can_modify_availability`, `can_view_medical`, `can_view_private_notes`, `can_message_players`, `can_export_reports`, `can_manage_calendar`, `can_manage_documents`, `is_head_coach`.

| Feature | Player | Staff w/o cap | Staff w/ cap | Head |
|---------|--------|---------------|--------------|------|
| Command Center | N | V | V | V |
| Manage roster | N | N | M if cap | M |
| Import stats | N | N | M if cap | M |
| Recruiting pipeline | N | Recruitability rules | Coach recruiting routes | M |
| Private notes | N | N | V if cap | V |
| Public packet | V via token | — | M | M |
| Player Today | V | N | N | N |
| Guardian views | P settings | — | settings | settings |

### Layer disagreement — Baseball

| Topic | Notes |
|-------|-------|
| Middleware | Capability route map on dashboard — stronger than golf |
| `withBaseballAction` | Canonical; legacy actions may omit — test for ungated actions |
| Player tree `/baseball/player/*` | Idle-gated but not same unauth dashboard redirect — layout backstop |
| Recruitability | Separate from staff caps |

---

## 4. Lift Lab matrix

| Feature | Athlete | Coach | Org viewer |
|---------|---------|-------|------------|
| Today / readiness | V/C check-ins | V | V |
| Edit programs | N | M | N |
| Live session | participate | M | V? |
| Join token | C | invite | N |

Wrapper: `withLiftingAction` (`requireEdit` option).

---

## 5. Admin matrices

| Surface | Gate | Risk |
|---------|------|------|
| `/golf/admin` | `users.role === 'admin'` | Privilege escalation if role writable |
| `/admin` | Super-admin allowlist env | Highest privilege; service role heavy |
| CRM send | Admin + Resend/Gmail | Must not run in automated scan against real coaches |

---

## 6. Cross-tenant attack surface (must test)

1. Substitute `team_id` / `player_id` / `organization_id` in Server Actions  
2. Golf Ask tool `player_id` off-roster (should fail `requireRosterPlayer`)  
3. Read insights for other team via forged IDs  
4. Baseball public profile/packet enumeration  
5. Calendar feed token guessing  
6. Dual-role user (coach+player) accessing wrong rail  
7. Assistant coach invoking head-only team switch cookie  
8. Removed membership still holding cookie/session  

---

## 7. Confidence notes

- Golf assistant fine-grained permissions: **Tentative** (role string exists; many checks are boolean coach).  
- Guardian as authenticated role: **Unknown** for full login UX.  
- Billing-gated features: **Confirmed absent**.  
