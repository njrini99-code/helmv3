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
import { logServerError } from '@/lib/server-error-logger';
// Category vocabulary lives in a plain module — a 'use server' file may only
// export async functions, so the const array cannot be exported from here.
import { RECRUIT_DOC_CATEGORIES, type RecruitDocCategory } from './recruit-documents-categories';
import { withAdminObserved } from '@/lib/admin/observed-action';

const BUCKET = 'recruit-documents';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — matches the bucket file_size_limit

// Extension → canonical MIME, covering the bucket's allowed_mime_types. Used to
// (a) derive an effective type when a browser sends an empty file.type, and
// (b) supply a correct contentType on upload.
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const ALLOWED_MIME = new Set<string>(Object.values(EXT_TO_MIME));

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

function fileExtension(name: string): string {
  return name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
}

/**
 * List documents for a recruit (RLS-gated to the team's coaches). Returns an
 * empty array on missing recruit / no permission so the panel can render an
 * empty state without try/catch noise on the client.
 */
async function getRecruitDocumentsImpl(
  recruitId: string,
): Promise<ActionResult<RecruitDocument[]>> {
  if (!recruitId) return { success: true, data: [] };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase
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

const observedGetRecruitDocuments = withAdminObserved(
  'getRecruitDocuments',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  getRecruitDocumentsImpl,
);

export async function getRecruitDocuments(
  recruitId: string,
): Promise<ActionResult<RecruitDocument[]>> {
  return observedGetRecruitDocuments(recruitId);
}

/**
 * Upload a file and attach it to a recruit. team_id is taken from the recruit's
 * own row (RLS on golf_recruits already limits what the coach can see), so a
 * coach can only file documents under a recruit they own.
 */
async function uploadRecruitDocumentImpl(
  recruitId: string,
  file: File,
  opts: { title?: string; category?: string } = {},
): Promise<ActionResult<{ id: string }>> {
  if (!recruitId) return { success: false, error: 'Recruit id required' };
  if (!file || file.size === 0) return { success: false, error: 'Choose a file to upload' };
  if (file.size > MAX_FILE_BYTES) {
    return { success: false, error: 'File is too large (max 25 MB)' };
  }

  // Resolve the effective MIME from the declared type or the extension. A file
  // with an empty file.type must NOT bypass the allowlist — reject if neither
  // the declared type nor the extension maps to an allowed type.
  const ext = fileExtension(file.name);
  const effectiveType = file.type || EXT_TO_MIME[ext] || '';
  if (!effectiveType || !ALLOWED_MIME.has(effectiveType)) {
    return { success: false, error: 'Unsupported file type' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Resolve the recruit's team. RLS ensures the coach only sees their own
    // team's recruits, so a miss here means no permission / not found.
    const { data: recruit, error: recruitError } = await supabase
      .from('golf_recruits')
      .select('id, team_id')
      .eq('id', recruitId)
      .maybeSingle();

    if (recruitError) throw recruitError;
    if (!recruit) return { success: false, error: 'Recruit not found' };

    const teamId: string = recruit.team_id;
    const objectName = `${teamId}/${recruitId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectName, file, { contentType: effectiveType, upsert: false });

    if (uploadError) {
      await logServerError(`uploadRecruitDocument storage failed: ${uploadError.message}`, {
        action: 'recruit_documents.uploadRecruitDocument',
        featureArea: 'recruiting',
        extra: { recruitId },
      });
      return { success: false, error: 'Upload failed. Try again.' };
    }

    const title = (opts.title ?? '').trim() || file.name;

    const { data: row, error: insertError } = await supabase
      .from('golf_recruit_documents')
      .insert({
        recruit_id: recruitId,
        team_id: teamId,
        title: title.slice(0, 200),
        category: normalizeCategory(opts.category),
        file_name: file.name,
        storage_path: objectName,
        file_type: effectiveType,
        file_size: file.size,
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      // Roll back the orphaned storage object so a failed insert doesn't leak a file.
      const { error: rollbackError } = await supabase.storage.from(BUCKET).remove([objectName]);
      if (rollbackError) {
        await logServerError(
          `uploadRecruitDocument rollback failed (orphaned object ${objectName}): ${rollbackError.message}`,
          { action: 'recruit_documents.uploadRecruitDocument', featureArea: 'recruiting', extra: { recruitId } },
        );
      }
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

    // No revalidatePath: the only consumer is a client panel
    // (FairwayRecruitDocuments) that re-fetches via getRecruitDocuments after
    // each mutation, so there is no server-rendered route to invalidate.
    return { success: true, data: { id: row.id } };
  } catch (err) {
    await logServerError(
      `uploadRecruitDocument error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.uploadRecruitDocument', featureArea: 'recruiting', extra: { recruitId } },
    );
    return { success: false, error: 'Failed to upload document' };
  }
}

const observedUploadRecruitDocument = withAdminObserved(
  'uploadRecruitDocument',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  uploadRecruitDocumentImpl,
);

export async function uploadRecruitDocument(
  recruitId: string,
  file: File,
  opts: { title?: string; category?: string } = {},
): Promise<ActionResult<{ id: string }>> {
  return observedUploadRecruitDocument(recruitId, file, opts);
}

/** Delete a recruit document (storage object + row). RLS gates to team coaches. */
async function deleteRecruitDocumentImpl(documentId: string): Promise<ActionResult> {
  if (!documentId) return { success: false, error: 'Document id required' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: doc, error: fetchError } = await supabase
      .from('golf_recruit_documents')
      .select('storage_path')
      .eq('id', documentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!doc) return { success: false, error: 'Document not found' };

    // Delete the row first (RLS-gated, authoritative for the UI); only then purge
    // storage. If the storage removal fails the row is already gone, so we log the
    // orphaned object for later cleanup rather than failing the coach's action.
    const { error: deleteError } = await supabase
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
      const { error: rmError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      if (rmError) {
        await logServerError(
          `deleteRecruitDocument storage remove failed (orphaned object ${doc.storage_path}): ${rmError.message}`,
          { action: 'recruit_documents.deleteRecruitDocument', featureArea: 'recruiting', extra: { documentId } },
        );
      }
    }

    // No revalidatePath: see uploadRecruitDocument — the client panel re-fetches.
    return { success: true };
  } catch (err) {
    await logServerError(
      `deleteRecruitDocument error: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'recruit_documents.deleteRecruitDocument', featureArea: 'recruiting', extra: { documentId } },
    );
    return { success: false, error: 'Failed to delete document' };
  }
}

const observedDeleteRecruitDocument = withAdminObserved(
  'deleteRecruitDocument',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  deleteRecruitDocumentImpl,
);

export async function deleteRecruitDocument(documentId: string): Promise<ActionResult> {
  return observedDeleteRecruitDocument(documentId);
}

/**
 * Short-lived (1h) signed URL for downloading/previewing a recruit document.
 * The bucket is private, so we never return a public URL.
 */
async function getRecruitDocumentUrlImpl(
  documentId: string,
): Promise<ActionResult<{ url: string; fileName: string; fileType: string | null }>> {
  if (!documentId) return { success: false, error: 'Document id required' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: doc, error: fetchError } = await supabase
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

const observedGetRecruitDocumentUrl = withAdminObserved(
  'getRecruitDocumentUrl',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  getRecruitDocumentUrlImpl,
);

export async function getRecruitDocumentUrl(
  documentId: string,
): Promise<ActionResult<{ url: string; fileName: string; fileType: string | null }>> {
  return observedGetRecruitDocumentUrl(documentId);
}
