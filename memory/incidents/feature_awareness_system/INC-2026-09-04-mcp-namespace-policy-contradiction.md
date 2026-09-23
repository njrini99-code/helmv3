# INC-2026-09-04 — an absolute MCP rule hid six unreviewed grants

- Feature: `feature_awareness_system`

## What happened

The constitution stated, flatly, "Production Supabase MCP access must
remain project-scoped and read-only." That was in force at the same time as
the owner's own `apply_migration` authorization for reviewed migrations —
the two contradicted each other. A rule that contradicts a live grant does
not get enforced, it gets ignored, and six unreviewed MCP grants sat
unnoticed underneath it.

## Root cause

Also relevant: the account-wide connector reaches the whole account, not
one project (`list_organizations` succeeds through it), while the
project-scoped `.mcp.json` server is the one actually declared read-only.
Conflating "the sanctioned path is project-scoped and read-only" with "no
other Supabase MCP access exists" is what let the account-wide connector's
broader reach go unrecorded.

## Fix / where it lives now

`AGENTS.md`'s Helm agent canonicality section now states which connector is
actually connected today (the account-wide one) and which of its tools are
denied by UUID in `permissions.deny`, rather than asserting an absolute
scope rule the live grants already contradicted. Current tool authority is
tracked in `docs/TOOL_AUTHORITY_MATRIX.md` and
`docs/CONTROL_PLANE_ENFORCEMENT.md`, not restated in prose here.
