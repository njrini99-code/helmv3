/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: `as any` casts on the supabase client because golf_recruit_documents was
// added in 20260614020000_recruit_documents.sql and the regenerated TS types
// don't include it yet. Once db:types is rerun, the casts can come out.

'use server';

/**
 * Server actions for per-recruit documents in Recruiting HQ.
 *
 * Recruiting material (notes, schedules, transcripts, film) is COACH-ONLY — the
 * Recruiting HQ page already bounces players, and golf_recruit_documents has no
 * player RLS policy. Files live in the PRIVATE `recruit-documents` storage bucket
 * under `{teamId}/{recruitId}/{uuid}.ext`; downloads are served via short-lived
 * signed URLs (the bucket is never public).
 *
 * team_id is always derived from the recruit's own row (never the active-team
 * cookie), and RLS + the same-team trigger reject any cross-team write.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
// Category vocabulary lives in a plain module — a 'use server' file may only
// export async functions, so the const array cannot be exported from here.
import { RECRUIT_DOC_CATEGORIES, type RecruitDocCategory } from './recruit-documents-categories';

const BUCKET = 'recruit-documents';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches the bucket file_size_limit

const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export interface RecruitDocument {
  id: string;
  recruit_id: string;
  team_id: string;
  title: string;
  category: RecruitDocCategory | string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function normalizeCategory(category?: string | null): RecruitDocCategory {
  const c = (category ?? '').trim().toLowerCase();
  return (RECRUIT_DOC_CATEGORIES as readonly string[]).includes(c)
    ? (c as RecruitDocCategory)
    : 'other';
}

/**
 * List documents for a recruit (RLS-gated to the team's coaches). Returns an
 * empty array on missing recruit / no permission so the panel can render an
 * empty state without try/catch noise on the client.
 */
export async function getRecruitDocuments(
  recruitId: string,
): Promise<ActionResult<RecruitDocument[]>> {
  if (!recruitId) return { success: true, data: [] };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await (supabase as any)
      .from('golf_recruit_documents')
      .select('*')
      .eq('recruit_id', recruitId)
      .order('created_at', { ascending: false });

    if (error) {
      await logServerError(`getRecruitDocuments failed: ${error.message}`, {
        action: 'recruit_documents.getRecruitDocuments',
        featureArea: 'recruiting',
        extra: { recruitId, code: error.code },
      });
      return { success: false, error: 'Failed to load documents' };
    }

    return { success: true, data: (data ?? []) as RecruitDocument[] };
  } catch (err) {
    await logServerError(
      `getRecruitDocuments error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.getRecruitDocuments', featureArea: 'recruiting', extra: { recruitId } },
    );
    return { success: false, error: 'Failed to load documents' };
  }
}

/**
 * Upload a file and attach it to a recruit. team_id is taken from the recruit's
 * own row (RLS on golf_recruits already limits what the coach can see), so a
 * coach can only file documents under a recruit they own.
 */
export async function uploadRecruitDocument(
  recruitId: string,
  file: File,
  opts: { title?: string; category?: string } = {},
): Promise<ActionResult<{ id: string }>> {
  if (!recruitId) return { success: false, error: 'Recruit id required' };
  if (!file || file.size === 0) return { success: false, error: 'Choose a file to upload' };
  if (file.size > MAX_FILE_BYTES) {
    return { success: false, error: 'File is too large (max 25 MB)' };
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { success: false, error: 'Unsupported file type' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Resolve the recruit's team. RLS ensures the coach only sees their own
    // team's recruits, so a miss here means no permission / not found.
    const { data: recruit, error: recruitError } = await (supabase as any)
      .from('golf_recruits')
      .select('id, team_id')
      .eq('id', recruitId)
      .maybeSingle();

    if (recruitError) throw recruitError;
    if (!recruit) return { success: false, error: 'Recruit not found' };

    const teamId: string = recruit.team_id;
    const ext = file.name.includes('.') ? file.name.split('.').pop() : null;
    const objectName = `${teamId}/${recruitId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectName, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      await logServerError(`uploadRecruitDocument storage failed: ${uploadError.message}`, {
        action: 'recruit_documents.uploadRecruitDocument',
        featureArea: 'recruiting',
        extra: { recruitId },
      });
      return { success: false, error: 'Upload failed. Try again.' };
    }

    const title = (opts.title ?? '').trim() || file.name;

    const { data: row, error: insertError } = await (supabase as any)
      .from('golf_recruit_documents')
      .insert({
        recruit_id: recruitId,
        team_id: teamId,
        title: title.slice(0, 200),
        category: normalizeCategory(opts.category),
        file_name: file.name,
        storage_path: objectName,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      // Roll back the orphaned storage object so a failed insert doesn't leak a file.
      await supabase.storage.from(BUCKET).remove([objectName]);
      await logServerError(`uploadRecruitDocument insert failed: ${insertError.message}`, {
        action: 'recruit_documents.uploadRecruitDocument',
        featureArea: 'recruiting',
        extra: { recruitId, code: insertError.code },
      });
      return {
        success: false,
        error: insertError.code === '42501'
          ? "Only this team's coaches can add recruit documents"
          : 'Failed to save document',
      };
    }

    revalidatePath('/golf/dashboard/recruiting');
    return { success: true, data: { id: row.id } };
  } catch (err) {
    await logServerError(
      `uploadRecruitDocument error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.uploadRecruitDocument', featureArea: 'recruiting', extra: { recruitId } },
    );
    return { success: false, error: 'Failed to upload document' };
  }
}

/** Delete a recruit document (storage object + row). RLS gates to team coaches. */
export async function deleteRecruitDocument(documentId: string): Promise<ActionResult> {
  if (!documentId) return { success: false, error: 'Document id required' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: doc, error: fetchError } = await (supabase as any)
      .from('golf_recruit_documents')
      .select('storage_path')
      .eq('id', documentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!doc) return { success: false, error: 'Document not found' };

    // Delete the row first (RLS-gated); only purge storage once that succeeds.
    const { error: deleteError } = await (supabase as any)
      .from('golf_recruit_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      await logServerError(`deleteRecruitDocument failed: ${deleteError.message}`, {
        action: 'recruit_documents.deleteRecruitDocument',
        featureArea: 'recruiting',
        extra: { documentId, code: deleteError.code },
      });
      return {
        success: false,
        error: deleteError.code === '42501'
          ? "Only this team's coaches can delete recruit documents"
          : 'Failed to delete document',
      };
    }

    if (doc.storage_path) {
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    }

    revalidatePath('/golf/dashboard/recruiting');
    return { success: true };
  } catch (err) {
    await logServerError(
      `deleteRecruitDocument error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.deleteRecruitDocument', featureArea: 'recruiting', extra: { documentId } },
    );
    return { success: false, error: 'Failed to delete document' };
  }
}

/**
 * Short-lived (1h) signed URL for downloading/previewing a recruit document.
 * The bucket is private, so we never return a public URL.
 */
export async function getRecruitDocumentUrl(
  documentId: string,
): Promise<ActionResult<{ url: string; fileName: string; fileType: string | null }>> {
  if (!documentId) return { success: false, error: 'Document id required' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: doc, error: fetchError } = await (supabase as any)
      .from('golf_recruit_documents')
      .select('storage_path, file_name, file_type')
      .eq('id', documentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!doc) return { success: false, error: 'Document not found' };

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 3600);

    if (signError || !signed) {
      throw signError ?? new Error('Could not create download link');
    }

    return {
      success: true,
      data: { url: signed.signedUrl, fileName: doc.file_name, fileType: doc.file_type ?? null },
    };
  } catch (err) {
    await logServerError(
      `getRecruitDocumentUrl error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.getRecruitDocumentUrl', featureArea: 'recruiting', extra: { documentId } },
    );
    return { success: false, error: 'Failed to open document' };
  }
}
