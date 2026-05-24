# CoachHelm v3 — RLS Template

> Canonical Row-Level Security patterns for v3 tables. Every new v3 table must enable RLS and apply one of these patterns. Schema corrections from prod verification (Part II) are baked in: **coach↔team is via `golf_team_coach_staff`, not a non-existent `golf_coaches.team_id`.**

---

## Helper Functions (shipped in W9-pt2)

```sql
-- Current authenticated player row, or NULL if the user is not a player.
CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM golf_players WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Current authenticated coach row, or NULL.
CREATE OR REPLACE FUNCTION public.current_coach_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM golf_coaches WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Is the current user a coach for the given team? (uses staff join — see Part II)
CREATE OR REPLACE FUNCTION public.is_team_coach(team_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_coach_staff s
    JOIN golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = team_uuid AND c.user_id = auth.uid()
  );
$$;

-- Is the current user a player on the given team?
CREATE OR REPLACE FUNCTION public.is_team_player(team_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_members m
    JOIN golf_players p ON p.id = m.player_id
    WHERE m.team_id = team_uuid AND p.user_id = auth.uid() AND m.status = 'active'
  );
$$;

-- Either-or convenience.
CREATE OR REPLACE FUNCTION public.is_in_team(team_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_team_coach(team_uuid) OR is_team_player(team_uuid);
$$;
```

These five helpers are the only sanctioned access primitives. Policies SHOULD NOT inline equivalent joins — use the helpers so a schema correction patches every policy at once.

---

## Pattern 1 — Player-Owned, Coach-Optionally-Visible

For tables where a player owns the row but may share with their coach (Goals is the canonical case).

```sql
ALTER TABLE golf_goals ENABLE ROW LEVEL SECURITY;

-- Player can do anything to their own goals.
CREATE POLICY goals_player_own ON golf_goals FOR ALL TO authenticated
  USING (player_id = current_player_id());

-- Coach can SELECT goals on their team, but only those the player shared OR the coach assigned.
CREATE POLICY goals_coach_view ON golf_goals FOR SELECT TO authenticated
  USING (
    is_team_coach(team_id) AND (
      creator_role = 'coach' OR shared_with_coach = true
    )
  );

-- Coach can INSERT goals only on their own team and as themselves.
CREATE POLICY goals_coach_create ON golf_goals FOR INSERT TO authenticated
  WITH CHECK (
    is_team_coach(team_id)
    AND creator_role = 'coach'
    AND coach_id_if_assigned = current_coach_id()
  );
```

**Why split SELECT and INSERT?** Coach can see assigned + shared but cannot bulk-insert under another coach's identity. The `WITH CHECK` enforces that `coach_id_if_assigned = current_coach_id()`.

---

## Pattern 2 — Coach-Owned, Player-Invisible

For data that exists only between the coach and the engine (Coach Intent is the canonical case).

```sql
ALTER TABLE golf_coach_player_intent ENABLE ROW LEVEL SECURITY;

CREATE POLICY intent_coach_only ON golf_coach_player_intent FOR ALL TO authenticated
  USING (coach_id = current_coach_id());
```

No player policy at all. Per locked decision (Part III), intent is invisible to the player.

---

## Pattern 3 — Team-Scoped Shared Read, Coach-Only Write

For tables where everyone on the team can read but only coaches write (Qualifier selections, weekly emails).

```sql
ALTER TABLE golf_qualifier_selections ENABLE ROW LEVEL SECURITY;

-- Anyone on the team can read (player can see why they were/weren't picked).
CREATE POLICY selections_team_read ON golf_qualifier_selections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_qualifiers q
      WHERE q.id = qualifier_id AND is_in_team(q.team_id)
    )
  );

-- Only the team's coach can insert.
CREATE POLICY selections_coach_write ON golf_qualifier_selections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM golf_qualifiers q
      WHERE q.id = qualifier_id AND is_team_coach(q.team_id)
    )
    AND selected_by_user_id = auth.uid()
  );
```

---

## Pattern 4 — Engine Writes via `service_role`

Engine-written tables (`golf_coach_insights`, `golf_player_standing`, `golf_player_genome`) use RLS to gate user reads, but engine writes use the service-role client which bypasses RLS. Pattern:

```sql
ALTER TABLE golf_player_standing ENABLE ROW LEVEL SECURITY;

-- Player reads their own.
CREATE POLICY standing_player_read ON golf_player_standing FOR SELECT TO authenticated
  USING (player_id = current_player_id());

-- Coach reads any player on their team.
CREATE POLICY standing_coach_read ON golf_player_standing FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM golf_team_members m
      WHERE m.player_id = standing.player_id AND is_team_coach(m.team_id)
    )
  );

-- No INSERT/UPDATE policies for authenticated; engine uses service-role.
```

**Never** add an `authenticated` write policy on engine tables. The engine writes via `createAdminClient()` in `src/lib/supabase/server.ts` and that bypasses RLS by design.

---

## Testing Standards

Every new RLS policy ships with tests (see [`docs/v3-testing-standards.md`](./v3-testing-standards.md) §RLS):

- A positive test: user X can read/write rows they should.
- A negative test: user X cannot read/write rows they shouldn't.
- A cross-team test: coach on team A cannot read team B's rows.
- A transfer test: a player who has moved teams loses access to their old team's view (relevant for Pattern 3).

Tests use Supabase's `auth.set_session` helper in a SQL fixture or the typescript test helpers under `src/test/rls/`.

---

## Common Mistakes

- **Joining to `golf_coaches.team_id`** — that column does not exist. Use `golf_team_coach_staff` via `is_team_coach()`.
- **Forgetting `WITH CHECK` on INSERT policies** — `USING` is read-time, `WITH CHECK` is write-time. Coach-create policies must have both.
- **`USING (auth.uid() = ...)` directly** — always go through the helpers so a schema change updates everything at once.
- **Trusting the client to filter** — RLS is the only enforcement. Server actions and route handlers must not relax it.
