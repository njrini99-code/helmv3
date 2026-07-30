# Helm Role and Permission Matrix

## Identity model

| Role/persona | Stored in | Tenancy relation | Important enforcement |
| --- | --- | --- | --- |
| Unauthenticated visitor | No auth row | None | Middleware/public route list and tokenized links |
| Invited/unregistered | Invitation row; auth may not exist yet | Token/code points to team | Expiry, email binding, redemption counter/status |
| Global admin | users.role=admin | Cross-product | Used by Golf admin; not identical to platform super-admin |
| Platform super-admin | Authenticated user id listed in server-only SUPER_ADMIN_USER_IDS | Cross-product | requireSuperAdmin |
| Baseball primary/head coach | baseball_coaches + team staff is_primary/role | Per team; organization profile | withBaseballAction + capabilities + RLS |
| Baseball scoped staff | baseball_team_coach_staff capability/scope columns | Per team and optional players/groups | UI route map, action wrapper, RLS |
| Baseball player | baseball_players + baseball_team_members | Can be team-scoped | Player/self actions and RLS |
| Golf head coach | golf_coaches + golf_team_coach_staff role=head_coach | One or two same-organization teams | Resolver/action checks + is_golf_team_coach RLS |
| Golf assistant coach | golf_team_coach_staff role=assistant_coach | Per team | RLS often treats as team coach; UI restrictions vary |
| Golf player | golf_players + golf_team_members | Current validation restricts to one team | Self/team RLS |
| Lifting coach | helm_lifting_coaches/coach_assignments | Per lifting organization | withLiftingAction edit access |
| Lifting org viewer | helm_lifting_org_viewers | Per organization | View, optionally can_edit |
| Lifting athlete | helm_lifting_athletes | Per organization/self | Own sessions/check-ins and RLS |

Live aggregates observed without identities: `users.role` contained 1 admin, 26 coaches, and 96 players; Golf staff contained 15 head coaches and 1 assistant coach; 7 Baseball staff rows, 34 Baseball team memberships, and 51 Golf team memberships were active. These counts are context only and not test fixtures.

## Intended capability matrix

Legend: View/Create/Edit/Delete/Manage/No; “Capability” means the exact Baseball staff boolean/player scope controls access. This matrix is an evidence-backed product contract, not proof that every live policy agrees.

| Feature/action | Unauth | Invited | Golf player | Golf head coach | Golf assistant | Baseball player | Baseball primary | Baseball scoped staff | Lifting athlete | Lifting coach | Org viewer | Platform admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public marketing/auth | View | View | View | View | View | View | View | View | View | View | View | View |
| Create organization/team | No | No | No | Create | Conditional | No | Create | Conditional | No | Create | No | Manage |
| View team roster | No | No | Own team | View | View | Own team | View | Scoped | Own org | View | View | Manage |
| Add/edit/remove roster | No | No | No | Manage | Manage via Golf coach RLS | No | Manage | Capability | No | Manage | No | Manage |
| Invite/change staff | No | Accept token | No | Manage | Limited/unknown UI | No | Manage | No unless granted | No | Manage | No | Manage |
| Team settings | No | No | No | Manage | Edit via team coach policy | No | Manage | Capability | No | Manage | View | Manage |
| Calendar view | No | No | Own team | View/Edit | View/Edit | Own team | View/Edit | Capability | Own assignments | View | View | Manage |
| Create/edit events/practices | No | No | No | Create/Edit | Create/Edit | No | Create/Edit | Capability | No | No | No | Manage |
| RSVP/attendance | No | No | Own RSVP | Manage | Manage | Own RSVP/ack | Manage | Capability | Own check-in | Manage | View | Manage |
| Stats/round entry | No | No | Own round | View team | View team | Own/self where exposed | Manage | Capability | Own results | Manage | View | Manage |
| Coach-only notes/academics | No | No | No | View/Edit | View/Edit team data | No | View/Edit | Capability + player scope | No | No | No | Manage |
| Player-visible development | No | No | Own | Manage | Manage | Own | Manage | Capability | Own | Manage | View | Manage |
| Messaging | No | No | Participate | Participate | Participate | Participate | Participate | Scoped | No feature | No feature | No feature | Manage |
| Documents | Public buckets only | No | Team metadata; storage gap | Manage | Manage | Scoped | Manage | Capability | Scoped | Manage | View | Manage |
| CoachHelm chat/read tools | No | No | Player hub only | Use | Use | No | No active equivalent | No | No | No | No | Manage telemetry |
| CoachHelm write tools | No | No | No | Approve | Approve if team coach | No | No active equivalent | No | No | No | No | Audit |
| Lifting program management | No | No | No | Via bridge only | Via bridge only | No | Via bridge only | Via bridge/cap | Own sessions | Manage | View; edit if granted | Manage |
| Billing/CRM/admin | No | No | No | No | No | No | No | No | No | No | No | Manage |

## UI vs server vs RLS comparison

| Boundary | UI enforcement | Server enforcement | Live RLS/RPC enforcement | Confidence | Gap |
| --- | --- | --- | --- | --- | --- |
| Baseball dashboard capabilities | Middleware/nav/controls use capability map | withBaseballAction validates active context/capability/player scope | Team policies generally scope rows; direct RPC grants vary | Confirmed | save box-score/recalculate RPC broader than action capability |
| Baseball messages | Conversation UI shows participant conversations | Actions resolve current user | Duplicate permissive message policies and user-id definer RPC break isolation | Confirmed | Critical disagreement |
| Baseball raw player/team directory | Roster/read models are scoped | Action wrapper scopes mutations | Raw baseball_players/baseball_teams SELECT is broad to authenticated users | Confirmed | Critical disagreement |
| Baseball staff invitation | Token/email flow | Server Action compares authenticated email | Direct acceptance RPC does not compare auth email | Confirmed | Critical direct-RPC bypass |
| Golf team coach actions | Pages/control visibility based on coach/team | Per-action checks; some organization-level | is_golf_team_coach policies are exact-team backstop | Confirmed | Tasks/recipients can accept foreign player ids |
| Golf insights visibility | App applies V3 lifecycle visibility helper | Read actions usually call helper | RLS checks ownership/team, not lifecycle/version visibility | Confirmed | Direct reads can expose hidden/legacy records |
| Golf messaging | Participant UI | Actions resolve participants | Table RLS scoped, but user_conversation_ids trusts parameter | Confirmed | Direct-RPC identity gap |
| Golf documents | Metadata UI/team actions scoped | Server actions check team/role | Storage documents bucket is broad to any authenticated user | Confirmed | Critical object-layer disagreement |
| CoachHelm read tools | Coach-only route | Server resolves authenticated coach, active team and roster; tools omit team_id | Underlying RLS plus some admin/service reads | Confirmed | Service/admin paths require action-level proof |
| CoachHelm write tools | Approval UI required | Ledger claim + domain action checks | Domain RLS varies; partial child writes possible | Confirmed | Denial/reload/receipt truth gaps |
| Lifting | Layout/route role split | withLiftingAction edit/view/self | Organization/athlete policies | Confirmed | Only two route error boundaries; bridge cases need tests |
| Platform admin | Separate admin shells | /admin requireSuperAdmin; Golf admin checks users.role | Admin client bypasses RLS | Confirmed | Two non-equivalent admin identities |

## Baseball capability inventory

The live/source staff model includes: `can_export_reports`, `can_invite_staff`, `can_manage_calendar`, `can_manage_documents`, `can_manage_imports`, `can_manage_lifting`, `can_manage_lineups`, `can_manage_practice`, `can_manage_roster`, `can_manage_settings`, `can_manage_stats`, `can_message_players`, `can_message_team`, `can_modify_availability`, `can_view_academics`, `can_view_medical`, `can_view_private_notes`, `can_view_readiness`, `player_scope_ids`, `group_scope_ids`. Primary/head staff are treated as all-capability. Tests need a scoped assistant with only one capability at a time plus a player scope that excludes the same-name cross-tenant fixture.

**Evidence:** [src/lib/baseball/with-baseball-action.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/with-baseball-action.ts); [src/lib/supabase/middleware.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/supabase/middleware.ts); [src/app/baseball/actions/roles-permissions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/roles-permissions.ts); `baseball_team_coach_staff`.

## Membership removal and manual tampering expectations

- Removing or inactivating membership must invalidate active-team context on the next server request and deny direct page/action/RPC access.
- Role/capability changes must take effect without a new login; stale UI may hide/show incorrectly, but server and RLS must be authoritative.
- Expired/revoked invitations must not create membership, decrement counters indefinitely, or be resurrected by retry.
- Every user-supplied `team_id`, `organization_id`, `player_id`, conversation id, event id, task id, document key, and action-run id must be tested with a valid foreign-tenant id.
- Service-role/admin-client handlers require explicit server authorization before the client is created or before any target lookup is returned.
