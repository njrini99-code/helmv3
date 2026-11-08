'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { logServerError } from '@/lib/server-error-logger';
import { deleteDocument, saveTextDocument, updateDocument } from './documents';

const FOLDER_MAX = 60;
/** Undo for a save is the 8 seconds the card shows, plus the round trip. */
const UNDO_MS = 12_000;

/** The team's folders, most used first: a folder is just text on a document (TASK_FIELDS 5.15), so an empty one can't exist. */
async function askArtifactFoldersImpl(): Promise<{ folders: Array<{ name: string; count: number }>; error?: string }> {
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { folders: [], error: 'Unauthorized' };
  const { data, error } = await sb.from('golf_documents').select('folder').eq('team_id', ctx.team_id).not('folder', 'is', null).limit(1000);
  if (error) {
    await logServerError(`askArtifactFolders failed: ${error.message}`, { action: 'coachhelm.ask.artifactFolders' });
    return { folders: [], error: 'Couldn’t read your folders.' };
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) if (row.folder) counts.set(row.folder, (counts.get(row.folder) ?? 0) + 1);
  return { folders: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}

/** Save draft: a private document only coaches can see. `playerVisible: false` is the point: the save's own default shows players. */
async function saveAskArtifactImpl(input: { title: string; body: string; folder: string | null }): Promise<{ success: boolean; error?: string; id?: string; folder?: string | null; savedAt?: string }> {
  const title = input.title.trim().slice(0, 120);
  const folder = input.folder?.trim().slice(0, FOLDER_MAX) || null;
  if (!title || !input.body.trim()) return { success: false, error: 'There’s nothing to save yet.' };
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { success: false, error: 'Unauthorized' };
  const saved = await saveTextDocument(ctx.team_id, title, input.body, { category: 'other', playerVisible: false });
  if (!saved.data) return { success: false, error: saved.error ?? 'That didn’t save.' };
  if (folder) {
    const moved = await updateDocument(saved.data.id, { folder });
    // The document exists and is private, so this is still a save: say where it is instead of offering a second copy.
    if (moved.error) return { success: true, id: saved.data.id, folder: null, savedAt: new Date().toISOString(), error: 'Saved, but not in that folder. It’s in Documents.' };
  }
  return { success: true, id: saved.data.id, folder, savedAt: new Date().toISOString() };
}

/**
 * Undo for Save draft, inside its 8 seconds: the document this coach just saved goes, and so does its folder if it was the only thing in it (a folder is text on
 * a document, so there is nothing else to remove). Only a private document the signed-in coach created a moment ago is touched.
 */
async function undoAskArtifactImpl(input: { id: string; savedAt: string }): Promise<{ success: boolean; error?: string }> {
  if (!input.id || Date.now() - Date.parse(input.savedAt) > UNDO_MS) return { success: false, error: 'Too late to undo. It’s saved in Documents.' };
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { success: false, error: 'Unauthorized' };
  const { data: user } = await sb.auth.getUser();
  const { data: row, error } = await sb.from('golf_documents').select('id, team_id, is_public, uploaded_by, created_at').eq('id', input.id).maybeSingle();
  if (error) {
    await logServerError(`undoAskArtifact read failed: ${error.message}`, { action: 'coachhelm.ask.undoArtifact' });
    return { success: false, error: 'That wasn’t undone.' };
  }
  if (!row) return { success: true };
  if (row.team_id !== ctx.team_id || row.is_public !== false || row.uploaded_by !== user.user?.id) return { success: false, error: 'That wasn’t undone.' };
  const gone = await deleteDocument(input.id);
  return gone.success ? { success: true } : { success: false, error: 'That wasn’t undone.' };
}

const observedFolders = withAdminObserved('askArtifactFolders', { sport: 'golf', feature: 'documents' }, askArtifactFoldersImpl);
const observedSave = withAdminObserved('saveAskArtifact', { sport: 'golf', feature: 'documents' }, saveAskArtifactImpl);
const observedUndo = withAdminObserved('undoAskArtifact', { sport: 'golf', feature: 'documents' }, undoAskArtifactImpl);

export async function askArtifactFolders() {
  return observedFolders();
}
export async function saveAskArtifact(input: { title: string; body: string; folder: string | null }) {
  return observedSave(input);
}
export async function undoAskArtifact(input: { id: string; savedAt: string }) {
  return observedUndo(input);
}
