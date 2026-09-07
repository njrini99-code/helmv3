# BLOCKED — everything, one page

Session `helmv3-38`. GolfHelm Messages audit, 2026-09-07.

**The audit itself is done** — 57 findings, seven lanes, branch
`agent/mobile-messages-audit`, worktree `~/worktrees/helmv3/mobile-messages-audit/audit/`.
Start at `M00-MANIFEST.md`. Nothing below blocks it. These are the things I could not
do myself, in one place.

---

## A. Needs access I don't have

### A1. Production DB read — settles 4 findings
Supabase SQL editor, project ref `qmnssrrolpinvwjjnufo`. Read-only.

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public'
  and tablename in ('golf_conversation_participants', 'users')
order by tablename, policyname;

select proname from pg_proc
where proname = 'golf_conversation_has_other_participant';
```

| Result | Means |
|---|---|
| `golf_participants_insert_v2` + function present | Migration `20260819070000` applied; cross-tenant injection guard is LIVE (**G-38** closed) |
| Either missing | It never ran. G-38 becomes the most urgent item in the audit |
| `users` shows only `users_select_own` + `admin_read_all` | Confirms **G-51**: the shipped roster presence dot can only ever light for the viewer, never a teammate |
| — | Also informs **G-44** (signed attachment URLs may not enforce membership) and M01's zero-pgTAP-coverage claim |

The migration self-reports `NOT APPLIED BY THE AUTHORING SESSION`, and nothing in the
repo records it was ever applied since.

**Why I can't:** `SUPABASE_DB_PASSWORD` is deliberately not in `.env.local` (correct — it
is Postgres superuser on shared production, stronger than the service-role key). The MCP
server needs an OAuth flow only you can complete. The Management API path
(`SUPABASE_ACCESS_TOKEN` + derived ref, how `gen-db-types.sh` authenticates) was denied by
the auto-mode classifier. `npm run db:rls-coverage` exists and is purpose-built and
read-only, but exits 2 — no connection credentials.

### A2. Confirm CI actually runs the DB scripts — **RESOLVED, see `A2-RESOLUTION.md`**
> Answered 2026-09-07 once the `9b03fb923` guard fix unblocked the read. Short version:
> the grep below is a **false negative** — `check-supabase-drift` is wired twice (via the
> npm alias `db:drift:check`) but covers nothing about G-38; `rls-coverage` genuinely has
> no caller; and a third script, `check-ledger-vs-catalog`, is wired, *could* answer G-38,
> and has never executed. **§A1 stays blocked either way.** Read `A2-RESOLUTION.md` before
> acting on anything below.

```bash
grep -rln "rls-coverage\|check-supabase-drift" .github/workflows/
```
**Empty result means G-38 is not "deferred to CI" — it is unchecked everywhere.**
`quality-gates.md` documents this exact shape twice: `check:ledger` "has a test proving
the guard works, but no workflow invokes the script itself", and `orphans:mounts` "has no
CI caller." A script existing is not evidence anything runs it.

**Why I can't:** `guard-config-change` text-blocks Bash from reading the workflow
directory. `HELM_CONFIG_EDIT=1` would clear it but asserts an intentional config change I
am not making, so I did not set it.

### A3. Session handle
Run `/status` in the session you called "triple check trace" and send me the handle.
Session URLs are not addressable — I can only message handles from `ListAgents`:
`helmv3-bb`, `helmv3-0e`, `helmv3-2e`.

### A4. Minor, no action needed
Reading `.env.local` directly was denied. I worked around it legitimately — derived what I
needed from key *names* only, never values.

---

## B. Needs a decision from you

| ID | Decision | Why it can't be settled below you |
|---|---|---|
| **D-05** | Focus-ring color | Three-way conflict: §9.1 wants a crisp edge; the artboard draws an `accent-500` glow; `design-tokens.css` deliberately chose `accent-600` (light) / `accent-500` (dark) after a documented 175-call-site WCAG fix. Theme-dependent — no single color resolves it |
| **G-55** | Action-list order | `Actions.dc.html`, `Reactions.dc.html` and §12.4's prose each specify a different order |
| **G-50** | Day-chip mechanism, bubble max-width | The artboards disagree with each other (288 vs 296 vs 268–292px) |
| **D-03a** | Group member roles | `GroupDetails` implies an Admin badge; `golf_conversation_participants` has no candidate column. §24.5 forbids inventing roles — so schema change, or drop the badge |
| **M05** | Independent fidelity review | Not runnable as §24.6 writes it (nothing rendered). Recommend deferring to a phase with a running app rather than a source-level stand-in |

---

## C. Already decided — no action, listed so nothing re-opens

- **Branch reconciliation** — take the work on `agent/messages-instant-entry`. Budget it as
  "wire up an existing shell", not merge-and-polish: it implements ~3 of ~11
  `GroupDetails` elements. Local tip `e3aec2315` ≠ remote `c65dd47b5`; pick one explicitly.
- **Presence dots + masthead bell badge** — deferred, not built. (The bell has a correct
  per-viewer contract already; consume it, don't invent a count.)
- **Fairway tokens/components** — build with them, never fork primitives. Six unmapped
  artboard values go to A03 as variant requests.
- **`SUPABASE_DB_PASSWORD`** — stays in GitHub secrets. Settled; not asked again.

---

## D. The three findings worth reading first, if nothing else

1. **G-08** — a failed attachment insert reports **success** to the sender
   (`message-attachments.ts:157`). Permanently broken bubble, orphaned storage object, and
   the client comment at `MessageThreadPane.tsx:576-596` will convince the next reader it's
   already handled (it treats the case as a transient race — this failure is permanent).
2. **G-40** — one member opening a team chat clears the unread badge for **everyone**;
   unread runs on a shared `golf_messages.read` boolean, not per-viewer `last_read_at`.
3. **G-26** — the QA-line-C alignment defect the plan names in its own opening paragraph is
   live and structural (`MessageThreadPane.tsx:1046-1270`, metadata is a sibling flex item
   of the message column). Both test files run under jsdom, which computes no flex layout —
   so nothing catches it.
