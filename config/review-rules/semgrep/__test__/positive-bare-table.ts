// Positive fixture for the ast-grep `helmv3-no-bare-table-names` rule.
// This file MUST fire that rule. Bare-named tables don't exist in the
// helmv3 production schema — CLAUDE.md "Table Names — ALWAYS Use Sport
// Prefix" is the source of truth.
//
// IMPORTANT: this fixture also includes a `supabase.storage.from(...)`
// call against a bucket named 'documents'. The rule must NOT fire on
// that line. See
// docs/operations/2026-05-28-coderabbit-fails-investigation.md.

import { createClient } from '@/lib/supabase/server';

export async function bareCalls() {
  const supabase = await createClient();

  // BAD: bare table name, no sport prefix → rule must fire.
  await supabase.from('coaches').select('*');
  await supabase.from('players').select('*');
  await supabase.from('teams').select('*');

  // OK: storage bucket access, not a DB table → rule must NOT fire.
  await supabase.storage.from('documents').remove(['path/to/file']);
}
