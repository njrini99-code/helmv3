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
import { observeStorageResult } from '@/lib/observability/supabase/observe-storage';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { describeError } from '@/lib/utils/describe-error';
import {
  recruitDocMime,
  recruitDocExtension,
  recruitDocMaxBytes,
} from './recruit-documents-limits';

const BUCKET = 'recruit-documents';

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
  /** Set when the file itself was refused (its type or its size), so a caller can say so beside the file instead of as a generic failure. */
  refused?: 'size' | 'type';
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
      `getRecruitDocuments error: ${describeError(err)}`,
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

// ── Direct upload (Fairway and Clubhouse): the file never passes through a server action ─────────────────────────
// A server action carries a file in its request body, and Vercel Functions refuse a request body over about 4.5 MB
// with a 413 before the action runs, far below a 25 MB document or a film. So both recruiting pages ask here for a
// signed upload URL, send the bytes to Storage themselves, and then ask for the row to be recorded. (The old
// uploadRecruitDocument, which took the File as an argument, was removed for that reason.) Nothing here trusts the
// browser: the object path is built on the server from the recruit's own team, the type comes from the extension,
// and the row's size is read back from what Storage actually holds. Both steps are safe to repeat with the same
// uploadId, so a Retry after a lost answer finds what its first attempt did and never uploads or records twice.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MB = 1024 * 1024;

/** The coach's recruit (RLS limits the read to their own team's), or why there is none. */
async function resolveRecruitTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recruitId: string,
): Promise<{ ok: true; teamId: string; userId: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };
  const { data: recruit, error } = await supabase
    .from('golf_recruits')
    .select('id, team_id')
    .eq('id', recruitId)
    .maybeSingle();
  if (error) throw error;
  if (!recruit) return { ok: false, error: 'Recruit not found' };
  return { ok: true, teamId: recruit.team_id as string, userId: user.id };
}

async function findStoredObject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  folder: string,
  objectName: string,
): Promise<{ found: boolean; size: number | null; readFailed: boolean }> {
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: objectName, limit: 10 });
  observeStorageResult({
    error,
    operation: 'download',
    feature: 'recruiting_prospect_tracking',
    action: 'list_recruit_document_object',
    bucketClass: 'recruit-documents/recruit_document',
    accessDeniedOnOwnPath: true,
  });
  if (error) return { found: false, size: null, readFailed: true };
  const hit = (data ?? []).find((o) => o.name === objectName);
  if (!hit) return { found: false, size: null, readFailed: false };
  const size = Number((hit.metadata as { size?: number } | null)?.size);
  return { found: true, size: Number.isFinite(size) ? size : null, readFailed: false };
}

export interface RecruitUploadMeta {
  fileName: string;
  fileSize: number;
  /** One per chosen file, made by the page and kept across a Retry: it names the object, so a repeat finds the first attempt's. */
  uploadId: string;
}

/**
 * Where to send the bytes. `signedUrl` and `token` are one signature for one object: `path`, which the server built from
 * the recruit's own team and the uploadId (Storage binds the token to that path, so it cannot be used for any other).
 * The Clubhouse page PUTs to `signedUrl`; the Fairway panel hands `path` and `token` to the browser client's
 * `uploadToSignedUrl`. When the object is already stored, signedUrl and token are null and there is nothing to send.
 */
export interface RecruitUploadTicket {
  contentType: string;
  signedUrl: string | null;
  /** The object's path inside the bucket, built on the server. */
  path?: string;
  token?: string | null;
}

/**
 * Step one: check the file against the bucket's rules and hand back a signed URL to send it to (valid for two hours).
 * `signedUrl` is null when the object is already in Storage, which happens when an earlier attempt sent it and its
 * answer was lost: the page skips the transfer and goes straight to recording it.
 */
async function prepareRecruitDocumentUploadImpl(
  recruitId: string,
  meta: RecruitUploadMeta,
): Promise<ActionResult<RecruitUploadTicket>> {
  if (!recruitId) return { success: false, error: 'Recruit id required' };
  if (!meta || !UUID_RE.test(meta.uploadId ?? '')) return { success: false, error: 'Upload id required' };
  const ext = recruitDocExtension(meta.fileName ?? '');
  const contentType = recruitDocMime(ext);
  if (!contentType) return { success: false, refused: 'type', error: 'Unsupported file type' };
  if (!(meta.fileSize > 0)) return { success: false, error: 'Choose a file to upload' };
  const max = recruitDocMaxBytes(ext);
  if (meta.fileSize > max) {
    return { success: false, refused: 'size', error: `File is too large (max ${Math.round(max / MB)} MB)` };
  }

  try {
    const supabase = await createClient();
    const team = await resolveRecruitTeam(supabase, recruitId);
    if (!team.ok) return { success: false, error: team.error };

    const folder = `${team.teamId}/${recruitId}`;
    const objectName = `${meta.uploadId}.${ext}`;

    // A repeat: the bytes are already there. (A failed read is not proof either way, so it falls through to signing; a
    // second transfer to an existing path is refused by Storage as a duplicate, which the page also treats as "already there".)
    const stored = await findStoredObject(supabase, folder, objectName);
    const storagePath = `${folder}/${objectName}`;
    if (stored.found) return { success: true, data: { contentType, signedUrl: null, path: storagePath, token: null } };

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    observeStorageResult({
      error: signError,
      operation: 'upload',
      feature: 'recruiting_prospect_tracking',
      action: 'sign_recruit_document_upload',
      bucketClass: 'recruit-documents/recruit_document',
      accessDeniedOnOwnPath: true,
    });
    if (signError || !signed?.signedUrl) {
      await logServerError(`prepareRecruitDocumentUpload sign failed: ${signError?.message ?? 'no url'}`, {
        action: 'recruit_documents.prepareRecruitDocumentUpload',
        featureArea: 'recruiting',
        extra: { recruitId },
      });
      return { success: false, error: "Couldn't start the upload. Try again." };
    }
    return { success: true, data: { contentType, signedUrl: signed.signedUrl, path: storagePath, token: signed.token ?? null } };
  } catch (err) {
    await logServerError(
      `prepareRecruitDocumentUpload error: ${describeError(err)}`,
      { action: 'recruit_documents.prepareRecruitDocumentUpload', featureArea: 'recruiting', extra: { recruitId } },
    );
    return { success: false, error: "Couldn't start the upload. Try again." };
  }
}

const observedPrepareRecruitDocumentUpload = withAdminObserved(
  'prepareRecruitDocumentUpload',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  prepareRecruitDocumentUploadImpl,
);

export async function prepareRecruitDocumentUpload(
  recruitId: string,
  meta: RecruitUploadMeta,
): Promise<ActionResult<RecruitUploadTicket>> {
  return observedPrepareRecruitDocumentUpload(recruitId, meta);
}

/**
 * Step two: record a file Storage now holds. The object's path is rebuilt here from the recruit's team and the
 * uploadId (a path from the browser is never taken), and its size is read back from Storage. Safe to repeat: a
 * document already recorded for that object is returned as it is.
 */
async function completeRecruitDocumentUploadImpl(
  recruitId: string,
  meta: { uploadId: string; fileName: string; title?: string; category?: string },
): Promise<ActionResult<{ id: string }>> {
  if (!recruitId) return { success: false, error: 'Recruit id required' };
  if (!meta || !UUID_RE.test(meta.uploadId ?? '')) return { success: false, error: 'Upload id required' };
  const ext = recruitDocExtension(meta.fileName ?? '');
  const contentType = recruitDocMime(ext);
  if (!contentType) return { success: false, refused: 'type', error: 'Unsupported file type' };

  try {
    const supabase = await createClient();
    const team = await resolveRecruitTeam(supabase, recruitId);
    if (!team.ok) return { success: false, error: team.error };

    const folder = `${team.teamId}/${recruitId}`;
    const objectName = `${meta.uploadId}.${ext}`;
    const storagePath = `${folder}/${objectName}`;

    const { data: existing, error: existingError } = await supabase
      .from('golf_recruit_documents')
      .select('id')
      .eq('recruit_id', recruitId)
      .eq('storage_path', storagePath)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { success: true, data: { id: existing.id as string } };

    const stored = await findStoredObject(supabase, folder, objectName);
    if (stored.readFailed) return { success: false, error: "Couldn't check the file. Try again." };
    if (!stored.found) return { success: false, error: 'The file did not reach storage. Try again.' };
    const max = recruitDocMaxBytes(ext);
    if (stored.size !== null && stored.size > max) {
      // Over this type's limit whatever the bucket let through: take it back out rather than keep what cannot be recorded.
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      observeStorageResult({
        error: removeError,
        operation: 'delete',
        feature: 'recruiting_prospect_tracking',
        action: 'complete_recruit_document_upload_oversize_remove',
        bucketClass: 'recruit-documents/recruit_document',
        accessDeniedOnOwnPath: true,
      });
      if (removeError) {
        await logServerError(
          `completeRecruitDocumentUpload oversize remove failed (object ${storagePath}): ${removeError.message}`,
          { action: 'recruit_documents.completeRecruitDocumentUpload', featureArea: 'recruiting', extra: { recruitId } },
        );
      }
      return { success: false, refused: 'size', error: `File is too large (max ${Math.round(max / MB)} MB)` };
    }

    const title = (meta.title ?? '').trim() || meta.fileName;
    const { data: row, error: insertError } = await supabase
      .from('golf_recruit_documents')
      .insert({
        recruit_id: recruitId,
        team_id: team.teamId,
        title: title.slice(0, 200),
        category: normalizeCategory(meta.category),
        file_name: meta.fileName,
        storage_path: storagePath,
        file_type: contentType,
        file_size: stored.size,
        uploaded_by: team.userId,
      })
      .select('id')
      .single();

    if (insertError) {
      await logServerError(`completeRecruitDocumentUpload insert failed: ${insertError.message}`, {
        action: 'recruit_documents.completeRecruitDocumentUpload',
        featureArea: 'recruiting',
        extra: { recruitId, code: insertError.code },
      });
      maybeCaptureRlsDenial(insertError, {
        table: 'golf_recruit_documents',
        verb: 'insert',
        action: 'completeRecruitDocumentUpload',
        feature: 'recruiting_prospect_tracking',
        sport: 'golf',
      });
      // The object stays, on purpose: a Retry carries the same uploadId, finds it, and records it without sending the file
      // again (a film is too large to send twice for a row that failed to save).
      return {
        success: false,
        error: insertError.code === '42501'
          ? "Only this team's coaches can add recruit documents"
          : 'Failed to save document',
      };
    }
    return { success: true, data: { id: row.id as string } };
  } catch (err) {
    await logServerError(
      `completeRecruitDocumentUpload error: ${describeError(err)}`,
      { action: 'recruit_documents.completeRecruitDocumentUpload', featureArea: 'recruiting', extra: { recruitId } },
    );
    return { success: false, error: 'Failed to save document' };
  }
}

const observedCompleteRecruitDocumentUpload = withAdminObserved(
  'completeRecruitDocumentUpload',
  { sport: 'golf', feature: 'recruiting_prospect_tracking' },
  completeRecruitDocumentUploadImpl,
);

export async function completeRecruitDocumentUpload(
  recruitId: string,
  meta: { uploadId: string; fileName: string; title?: string; category?: string },
): Promise<ActionResult<{ id: string }>> {
  return observedCompleteRecruitDocumentUpload(recruitId, meta);
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
      maybeCaptureRlsDenial(deleteError, {
        table: 'golf_recruit_documents',
        verb: 'delete',
        action: 'deleteRecruitDocument',
        feature: 'recruiting_prospect_tracking',
        sport: 'golf',
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
      observeStorageResult({
        error: rmError,
        operation: 'delete',
        feature: 'recruiting_prospect_tracking',
        action: 'delete_recruit_document',
        bucketClass: 'recruit-documents/recruit_document',
        accessDeniedOnOwnPath: true,
      });
      if (rmError) {
        await logServerError(
          `deleteRecruitDocument storage remove failed (orphaned object ${doc.storage_path}): ${rmError.message}`,
          { action: 'recruit_documents.deleteRecruitDocument', featureArea: 'recruiting', extra: { documentId } },
        );
      }
    }

    // No revalidatePath: the only consumers are client panels that re-fetch via getRecruitDocuments after each mutation.
    return { success: true };
  } catch (err) {
    await logServerError(
      `deleteRecruitDocument error: ${describeError(err)}`,
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
      `getRecruitDocumentUrl error: ${describeError(err)}`,
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
