'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { logServerError } from '@/lib/server-error-logger';
import { saveTextDocument, updateDocument } from './documents';

const FOLDER_MAX = 60;

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
async function saveAskArtifactImpl(input: { title: string; body: string; folder: string | null }): Promise<{ success: boolean; error?: string }> {
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
    if (moved.error) return { success: true, error: 'Saved, but not in that folder. It’s in Documents.' };
  }
  return { success: true };
}

const observedFolders = withAdminObserved('askArtifactFolders', { sport: 'golf', feature: 'documents' }, askArtifactFoldersImpl);
const observedSave = withAdminObserved('saveAskArtifact', { sport: 'golf', feature: 'documents' }, saveAskArtifactImpl);

export async function askArtifactFolders() {
  return observedFolders();
}
export async function saveAskArtifact(input: { title: string; body: string; folder: string | null }) {
  return observedSave(input);
}
