'use server';

/**
 * The Bridge's own notes (plan §4.5 `bridge_notes`; B05 BR-0506 Mark expected and BR-0507 Watch, B13 BR-1304 Mark sent
 * and BR-1306 Archive). Super admin only: every action gates first, then writes through the service role, because the
 * table grants authenticated users SELECT only (a super admin reads it, nobody writes it from the browser).
 *
 * Each action takes the form's FormData, validates it against the Bridge graph (a code must be registered, a pack
 * target must resolve), writes one row or resolves open ones, and redirects back to the screen it came from, where the
 * new state reads straight from the table. Nothing about a person is stored: a person's or a team's pack is refused,
 * since this table is kept forever (D7).
 */

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import type { BridgeGraph } from '@/lib/admin/clubhouse/graph';
import { resolvePackTarget } from '@/lib/admin/clubhouse/pack';
import { clubhouseHref } from '@/lib/admin/clubhouse/screens';
import { cleanReason, type NoteKind } from '@/lib/admin/clubhouse/notes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function graphOrThrow(): BridgeGraph {
  const graph = loadBridgeGraph();
  if (!graph) throw new Error('The Bridge graph is not readable');
  return graph;
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
};

/** A registered Bridge ID with a CH code, from the form's `id`. */
function codeFrom(graph: BridgeGraph, form: FormData): { id: number; ch: string; page: string } {
  const raw = text(form, 'id');
  const entry = /^\d{5,6}$/.test(raw) ? graph.ids[raw] : undefined;
  if (!entry?.ch) throw new Error('Not a registered code');
  return { id: Number(raw), ch: entry.ch, page: entry.page };
}

async function resolveOpen(kind: NoteKind, match: { code?: string; id?: string }): Promise<void> {
  let q = db().from('bridge_notes').update({ resolved_at: new Date().toISOString() }).eq('kind', kind).is('resolved_at', null);
  if (match.code) q = q.eq('code', match.code);
  if (match.id) q = q.eq('id', match.id);
  const { error } = await q;
  if (error) throw new Error(`Could not update the note: ${error.message}`);
}

async function hasOpen(kind: NoteKind, match: { code?: string; body?: string }): Promise<boolean> {
  let q = db().from('bridge_notes').select('id').eq('kind', kind).is('resolved_at', null);
  if (match.code) q = q.eq('code', match.code);
  if (match.body) q = q.eq('body', match.body);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`Could not read the notes: ${error.message}`);
  return (data ?? []).length > 0;
}

async function insertNote(row: { kind: NoteKind; code: string | null; bridge_id: number | null; page_id: string | null; body: string; created_by: string }): Promise<void> {
  const { error } = await db().from('bridge_notes').insert(row);
  if (error) throw new Error(`Could not save the note: ${error.message}`);
}

// ---------------------------------------------------------------------------
// B05: Mark expected (BR-0506) and Watch (BR-0507)
// ---------------------------------------------------------------------------

/** Marks a code expected with a reason; R-01 and R-02 skip it from then on. A second mark replaces the first. */
async function markCodeExpectedImpl(form: FormData): Promise<string> {
  const admin = await requireSuperAdmin();
  const graph = graphOrThrow();
  const code = codeFrom(graph, form);
  const reason = cleanReason(form.get('reason'));
  if (!reason) throw new Error('A reason is required');
  await resolveOpen('expected', { code: code.ch });
  await insertNote({ kind: 'expected', code: code.ch, bridge_id: code.id, page_id: code.page, body: reason, created_by: admin.userId });
  return clubhouseHref.code(code.id);
}

async function unmarkCodeExpectedImpl(form: FormData): Promise<string> {
  await requireSuperAdmin();
  const code = codeFrom(graphOrThrow(), form);
  await resolveOpen('expected', { code: code.ch });
  return clubhouseHref.code(code.id);
}

/** Starts or stops watching a code (`watch` = 1 or 0). Watching twice keeps one watch. */
async function setCodeWatchImpl(form: FormData): Promise<string> {
  const admin = await requireSuperAdmin();
  const code = codeFrom(graphOrThrow(), form);
  if (text(form, 'watch') === '1') {
    if (!(await hasOpen('watch', { code: code.ch }))) {
      await insertNote({ kind: 'watch', code: code.ch, bridge_id: code.id, page_id: code.page, body: '', created_by: admin.userId });
    }
  } else {
    await resolveOpen('watch', { code: code.ch });
  }
  return clubhouseHref.code(code.id);
}

// ---------------------------------------------------------------------------
// B13: Mark sent (BR-1304) and Archive (BR-1306)
// ---------------------------------------------------------------------------

const duetHref = (key: string | null) => clubhouseHref.duet(key ?? undefined);

/** Puts a pack on the queue as sent. The row keeps the target key only; the pack is rebuilt from it. */
async function markPackSentImpl(form: FormData): Promise<string> {
  const admin = await requireSuperAdmin();
  const graph = graphOrThrow();
  const target = resolvePackTarget(graph, text(form, 't'));
  if (!target) throw new Error('Not a pack target');
  if (target.kind === 'person' || target.kind === 'team') throw new Error("A person's or a team's pack is not kept (D7)");
  if (!(await hasOpen('pack', { body: target.key }))) {
    const ch = target.kind === 'code' ? (graph.ids[target.key]?.ch ?? null) : null;
    await insertNote({
      kind: 'pack',
      code: ch,
      bridge_id: target.kind === 'code' ? Number(target.key) : null,
      page_id: target.page,
      body: target.key,
      created_by: admin.userId,
    });
  }
  return duetHref(target.key);
}

/** Takes a pack off the queue. */
async function archivePackImpl(form: FormData): Promise<string> {
  await requireSuperAdmin();
  const id = text(form, 'note');
  if (!UUID.test(id)) throw new Error('Not a note id');
  await resolveOpen('pack', { id });
  const back = resolvePackTarget(graphOrThrow(), text(form, 't'));
  return duetHref(back?.key ?? null);
}

const OPTS = { sport: 'shared', feature: 'admin_dashboard' } as const;
const observedMarkExpected = withAdminObserved('bridgeNotes.markCodeExpected', OPTS, markCodeExpectedImpl);
const observedUnmarkExpected = withAdminObserved('bridgeNotes.unmarkCodeExpected', OPTS, unmarkCodeExpectedImpl);
const observedSetWatch = withAdminObserved('bridgeNotes.setCodeWatch', OPTS, setCodeWatchImpl);
const observedMarkSent = withAdminObserved('bridgeNotes.markPackSent', OPTS, markPackSentImpl);
const observedArchive = withAdminObserved('bridgeNotes.archivePack', OPTS, archivePackImpl);

// `'use server'` exports must be async function declarations; each delegates to its observed closure, then redirects
// back outside it (a redirect is control flow, not a failure to log).
export async function markCodeExpected(form: FormData): Promise<void> {
  redirect(await observedMarkExpected(form));
}

export async function unmarkCodeExpected(form: FormData): Promise<void> {
  redirect(await observedUnmarkExpected(form));
}

export async function setCodeWatch(form: FormData): Promise<void> {
  redirect(await observedSetWatch(form));
}

export async function markPackSent(form: FormData): Promise<void> {
  redirect(await observedMarkSent(form));
}

export async function archivePack(form: FormData): Promise<void> {
  redirect(await observedArchive(form));
}
