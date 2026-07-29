// =============================================================================
// Staff-invite email ownership — defence in depth, pinned.
//
// WHY THIS FILE EXISTS. The overnight recon flagged "staff invite accept RPC
// has no email-ownership check" as a P0: any authenticated user holding a
// leaked invite token could join any team AS STAFF. That finding was WRONG —
// the check is present, and has been since the RPC was first written. This
// file pins that, so the correction is durable rather than a note in a doc
// nobody reads, and so the check cannot be removed by a future refactor
// without a test going red.
//
// The claim is worth being careful about because the blast radius if it WERE
// true is large: staff capabilities include can_manage_roster,
// can_view_medical and can_view_private_notes, and signup is open.
//
// Three independent layers enforce it. Each is asserted below, because the
// interesting failure is not "all three vanish" — it is one vanishing while
// the other two hide it:
//
//   1. RLS  — baseball_staff_invitations' invitee_select policy limits an
//             authenticated user to invites addressed to their own email.
//   2. App  — acceptStaffInviteImpl re-checks before calling the RPC, so the
//             UI can render the specific "sent to a different address"
//             message instead of a generic failure.
//   3. RPC  — baseball_accept_staff_invite re-checks INSIDE the SECURITY
//             DEFINER body. This is the layer that actually matters: a client
//             calling supabase.rpc() directly skips layers 1 and 2 entirely.
//
// Layer 3 is asserted against the migration source rather than a live
// database. That is a real limitation — it proves the shipped SQL contains
// the check, not that the deployed function does. A pgTAP behavioural test
// would be stronger; see supabase/tests/rls/ for that idiom.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Every migration that defines baseball_accept_staff_invite, oldest first.
 * ALL of them must carry the check — a later CREATE OR REPLACE that dropped it
 * would silently supersede an earlier correct one, which is exactly how this
 * class of regression happens.
 */
const DEFINING_MIGRATIONS = [
  '20260624000062_baseball_accept_staff_invite_rpc.sql',
  '20260624000081_baseball_staff_roles_scope_audit.sql',
];

describe('baseball_accept_staff_invite — email ownership is enforced in the definer body', () => {
  it.each(DEFINING_MIGRATIONS)('%s defines the function', (file) => {
    const path = join(MIGRATIONS, file);
    expect(existsSync(path), `${file} is missing — update DEFINING_MIGRATIONS`).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain(
      'FUNCTION public.baseball_accept_staff_invite',
    );
  });

  it.each(DEFINING_MIGRATIONS)(
    '%s compares the invite email against the CALLER\'s auth.users email',
    (file) => {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

      // The caller's own email, resolved from auth.uid() — not from an
      // argument the caller controls.
      expect(sql).toMatch(/SELECT\s+lower\(u\.email\)\s+INTO\s+v_email\s+FROM\s+auth\.users\s+u\s+WHERE\s+u\.id\s*=\s*v_uid/i);

      // …and compared, case-insensitively, against the invitation's address,
      // rejecting a NULL caller email rather than letting it pass.
      expect(sql).toMatch(/IF\s+v_email\s+IS\s+NULL\s+OR\s+lower\(v_invite\.email\)\s*<>\s*v_email\s+THEN/i);
      expect(sql).toContain("'wrong_email'");
    },
  );

  it.each(DEFINING_MIGRATIONS)('%s is SECURITY DEFINER with a pinned search_path', (file) => {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    // Without a pinned search_path a definer function is hijackable via a
    // caller-controlled schema — the check above would still run, against the
    // wrong tables.
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
  });

  it('no later migration redefines the function without the check', () => {
    // Guards the specific regression shape: someone adds a capability column,
    // re-emits the function with CREATE OR REPLACE, and drops the email
    // comparison while copying the body. If this fails, a new migration
    // defines the function — add it to DEFINING_MIGRATIONS above, which will
    // then hold it to the same assertions.
    const found = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) =>
        readFileSync(join(MIGRATIONS, f), 'utf8').includes(
          'FUNCTION public.baseball_accept_staff_invite',
        ),
      )
      .sort();

    expect(found).toEqual([...DEFINING_MIGRATIONS].sort());
  });
});

describe('acceptStaffInvite (app layer) — the second line, not the only one', () => {
  it('rejects a token whose invite is addressed to someone else, before calling the RPC', () => {
    // Asserted at source rather than by invoking the action, because the
    // action is a `use server` export wrapped in withAdminObserved and its
    // Supabase surface is deep — the thing worth pinning is that the guard
    // exists AHEAD of the rpc() call, so a leaked token cannot even reach it.
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'baseball', 'actions', 'staff.ts'),
      'utf8',
    );

    const guardAt = src.indexOf("userEmail !== String(invite.email).trim().toLowerCase()");
    const rpcAt = src.indexOf("'baseball_accept_staff_invite'");

    expect(guardAt, 'the app-layer email guard is gone').toBeGreaterThan(-1);
    expect(rpcAt, 'the RPC call is gone').toBeGreaterThan(-1);
    expect(guardAt, 'the email guard must precede the RPC call').toBeLessThan(rpcAt);
  });

  it('surfaces the RPC\'s own wrong_email reason with actionable copy', () => {
    // If the app guard is ever removed, the RPC still refuses — and the user
    // must be told what to do about it, not just that it failed.
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', 'baseball', 'actions', 'staff.ts'),
      'utf8',
    );
    expect(src).toContain('wrong_email');
    expect(src).toMatch(/Sign in with the invited account/);
  });
});
