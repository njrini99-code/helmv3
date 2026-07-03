/* eslint-disable @typescript-eslint/no-explicit-any */
// Untyped document/version queries go through `(supabase as any)` until database.ts
// includes baseball_documents + baseball_document_versions (regen via npm run db:types).
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const SIGNED_URL_TTL_SECONDS = 3600;
const DOCUMENTS_PATH = '/baseball/dashboard/documents';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function signDocumentStoragePath(
  supabase: SupabaseServerClient,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Could not sign document URL');
  }

  return data.signedUrl;
}

/**
 * Resolve display names/emails for a set of `uploaded_by` user ids.
 *
 * `baseball_documents.uploaded_by` / `baseball_document_versions.uploaded_by`
 * are FKs to `public.users(id)`, which only has `id`/`email`/`role` — it has
 * no `full_name` column. A PostgREST embed like `uploader:uploaded_by(full_name,
 * email)` therefore always throws `column users_1.full_name does not exist`
 * (confirmed against the live schema), which is why the documents page
 * unconditionally rendered its error state. `full_name` actually lives on
 * `baseball_coaches` (documents can only be uploaded by a coach — upload/create
 * requires the `can_manage_documents` capability), keyed by the same
 * `public.users.id` via `baseball_coaches.user_id`. Resolve it with a
 * follow-up query instead of a broken embed; unknown/removed uploaders
 * degrade to `null` rather than failing the whole page load.
 */
async function resolveUploaders(
  supabase: SupabaseServerClient,
  userIds: Array<string | null | undefined>,
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();

  const { data } = await (supabase as any)
    .from('baseball_coaches')
    .select('user_id, full_name, email')
    .in('user_id', ids);

  const map = new Map<string, { full_name: string | null; email: string | null }>();
  for (const row of (data as { user_id: string; full_name: string | null; email: string | null }[] | null) || []) {
    map.set(row.user_id, { full_name: row.full_name, email: row.email });
  }
  return map;
}

function mapDocumentActionError(error: unknown): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage documents' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the document action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface BaseballDocument {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  is_player_visible: boolean;
  uploaded_by: string | null;
  version_count: number | null;
  folder: string | null;
  created_at: string | null;
  updated_at: string | null;
  uploader?: {
    full_name: string | null;
    email: string | null;
  } | null;
  versions?: BaseballDocumentVersion[];
}

export interface BaseballDocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_url?: string;
  change_notes: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  uploader?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

// Error handling helper
function handleError(error: unknown): string {
  // Fire-and-forget: logServerError handles its own errors
  void logServerError(`Baseball document action error: ${error instanceof Error ? error.message : String(error)}`, { action: 'documents.handleError' });
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// ============================================
// DOCUMENT CRUD OPERATIONS
// ============================================

/**
 * Re-sign each document's file_url from the latest version's storage_path.
 * A document's stored file_url is a signed URL that expires after
 * SIGNED_URL_TTL_SECONDS, so any list read must re-sign it fresh (mirrors
 * the per-open signing done in getPreviewUrl) rather than serving the
 * value persisted at upload time.
 */
async function withFreshDocumentUrls(
  supabase: SupabaseServerClient,
  documents: BaseballDocument[],
): Promise<BaseballDocument[]> {
  if (documents.length === 0) return documents;

  const { data: versionsData } = await (supabase as any)
    .from('baseball_document_versions')
    .select('document_id, storage_path, version_number')
    .in('document_id', documents.map((d) => d.id))
    .order('version_number', { ascending: false });

  const latestPathByDocument = new Map<string, string>();
  for (const v of (versionsData as { document_id: string; storage_path: string; version_number: number }[] | null) || []) {
    if (!latestPathByDocument.has(v.document_id)) {
      latestPathByDocument.set(v.document_id, v.storage_path);
    }
  }

  return Promise.all(
    documents.map(async (document) => {
      const storagePath = latestPathByDocument.get(document.id);
      if (!storagePath) return document;
      try {
        const signedUrl = await signDocumentStoragePath(supabase, storagePath);
        return { ...document, file_url: signedUrl };
      } catch (error) {
        void logServerError(
          `Failed to re-sign document URL for document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
          { action: 'documents.withFreshDocumentUrls' },
        );
        return document;
      }
    }),
  );
}

export async function getTeamDocuments(
  teamId: string,
  isCoach: boolean
): Promise<{ data: BaseballDocument[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { data: null, error: 'Not authenticated' };
    }

    let query = supabase
      .from('baseball_documents' as any)
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    // Players can only see documents where is_player_visible = true
    if (!isCoach) {
      query = query.eq('is_player_visible', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = (data as unknown as BaseballDocument[]) || [];
    const uploaderMap = await resolveUploaders(supabase, rows.map((d) => d.uploaded_by));
    const withUploaders = rows.map((doc) => ({
      ...doc,
      uploader: uploaderMap.get(doc.uploaded_by ?? '') ?? null,
    }));

    const documents = await withFreshDocumentUrls(supabase, withUploaders);

    return { data: documents, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function getDocument(
  documentId: string
): Promise<{ data: BaseballDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { data: null, error: 'Not authenticated' };
    }

    const { data, error } = await (supabase as any)
      .from('baseball_documents')
      .select(`
        *,
        versions:baseball_document_versions(*)
      `)
      .eq('id', documentId)
      .single();

    if (error) throw error;

    const document = data as unknown as BaseballDocument;
    const versions = (document?.versions as BaseballDocumentVersion[] | undefined) ?? [];

    const uploaderMap = await resolveUploaders(supabase, [
      document?.uploaded_by,
      ...versions.map((v) => v.uploaded_by),
    ]);

    document.uploader = uploaderMap.get(document?.uploaded_by ?? '') ?? null;

    // Sort versions by version number descending
    versions.sort((a, b) => b.version_number - a.version_number);
    document.versions = versions.map((v) => ({
      ...v,
      uploader: uploaderMap.get(v.uploaded_by ?? '') ?? null,
    }));

    return { data: document, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

// ============================================
// UPLOAD & CREATE
// ============================================

/**
 * Upload a file to Supabase Storage
 * Returns { success, file_url, error }
 */
export async function uploadBaseballDocument(
  file: File,
  teamId: string
): Promise<{ success: boolean; file_url?: string; storage_path?: string; error?: string }> {
  try {
    return await uploadBaseballDocumentAction(file, teamId);
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

const uploadBaseballDocumentAction = withBaseballAction(
  'uploadBaseballDocument',
  { featureArea: 'baseball-documents', requiredCapability: 'can_manage_documents' },
  async (ctx, file: File, teamId: string) => {
    const supabase = await createClient();

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_documents');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `baseball-documents/${teamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    const signedUrl = await signDocumentStoragePath(supabase, storagePath);

    return { success: true as const, file_url: signedUrl, storage_path: storagePath };
  },
);

/**
 * Create a document record (after file has been uploaded)
 */
export async function createBaseballDocument(data: {
  team_id: string;
  title: string;
  description?: string;
  file_url: string;
  storage_path?: string;
  file_type: string;
  file_size: number;
  category?: string;
  is_player_visible: boolean;
  uploaded_by: string;
  folder?: string;
}): Promise<{ success: boolean; data?: BaseballDocument; error?: string }> {
  try {
    return await createBaseballDocumentAction(data);
  } catch (error) {
    return mapDocumentActionError(error);
  }
}

const createBaseballDocumentAction = withBaseballAction(
  'createBaseballDocument',
  { featureArea: 'baseball-documents', requiredCapability: 'can_manage_documents' },
  async (ctx, data: {
    team_id: string;
    title: string;
    description?: string;
    file_url: string;
    storage_path?: string;
    file_type: string;
    file_size: number;
    category?: string;
    is_player_visible: boolean;
    uploaded_by: string;
    folder?: string;
  }) => {
    const supabase = await createClient();

    if (data.team_id !== ctx.activeTeamId) {
      await requireBaseballCapability(data.team_id, 'can_manage_documents');
    }

    const storagePath =
      data.storage_path ??
      (() => {
        const marker = 'baseball-documents/';
        const idx = data.file_url.indexOf(marker);
        if (idx === -1) return data.file_url.split('/').slice(-3).join('/');
        return data.file_url.slice(idx);
      })();

    const { data: document, error: insertError } = await (supabase as any)
      .from('baseball_documents')
      .insert({
        team_id: data.team_id,
        title: data.title,
        description: data.description || null,
        file_url: data.file_url,
        file_type: data.file_type,
        file_size: data.file_size,
        category: data.category || 'general',
        is_player_visible: data.is_player_visible,
        uploaded_by: ctx.user.id,
        version_count: 1,
        folder: data.folder || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const { error: versionError } = await (supabase as any)
      .from('baseball_document_versions')
      .insert({
        document_id: document.id,
        version_number: 1,
        file_name: data.title,
        file_size: data.file_size,
        mime_type: data.file_type,
        storage_path: storagePath,
        change_notes: 'Initial upload',
        uploaded_by: ctx.user.id,
      });

    if (versionError) {
      await logServerError(
        `Failed to create version record: ${versionError instanceof Error ? versionError.message : String(versionError)}`,
        { action: 'documents.createBaseballDocument' },
      );
    }

    revalidatePath(DOCUMENTS_PATH);
    return { success: true as const, data: document as BaseballDocument };
  },
);

// ============================================
// UPDATE & DELETE
// ============================================

export async function updateBaseballDocument(data: {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  is_player_visible?: boolean;
  folder?: string | null;
}): Promise<{ success: boolean; data?: BaseballDocument; error?: string }> {
  try {
    return await updateBaseballDocumentAction(data);
  } catch (error) {
    return mapDocumentActionError(error);
  }
}

const updateBaseballDocumentAction = withBaseballAction(
  'updateBaseballDocument',
  { featureArea: 'baseball-documents' },
  async (_ctx, data: {
    id: string;
    title?: string;
    description?: string;
    category?: string;
    is_player_visible?: boolean;
    folder?: string | null;
  }) => {
    const supabase = await createClient();

    const { data: existing } = await (supabase as any)
      .from('baseball_documents')
      .select('team_id')
      .eq('id', data.id)
      .single();

    if (!existing?.team_id) {
      return { success: false as const, error: 'Document not found' };
    }

    await requireBaseballCapability(String(existing.team_id), 'can_manage_documents');

    const updatePayload: Record<string, unknown> = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.is_player_visible !== undefined) updatePayload.is_player_visible = data.is_player_visible;
    if (data.folder !== undefined) updatePayload.folder = data.folder;

    const { data: document, error } = await (supabase as any)
      .from('baseball_documents')
      .update(updatePayload)
      .eq('id', data.id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(DOCUMENTS_PATH);
    return { success: true as const, data: document as BaseballDocument };
  },
);

export async function deleteBaseballDocument(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    return await deleteBaseballDocumentAction(documentId);
  } catch (error) {
    return mapDocumentActionError(error);
  }
}

const deleteBaseballDocumentAction = withBaseballAction(
  'deleteBaseballDocument',
  { featureArea: 'baseball-documents' },
  async (_ctx, documentId: string) => {
    const supabase = await createClient();

    const { data: existing } = await (supabase as any)
      .from('baseball_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (!existing?.team_id) {
      return { success: false as const, error: 'Document not found' };
    }

    await requireBaseballCapability(String(existing.team_id), 'can_manage_documents');

    const { data: versionsData } = await (supabase as any)
      .from('baseball_document_versions')
      .select('storage_path')
      .eq('document_id', documentId);
    const versions = versionsData as { storage_path: string }[] | null;

    if (versions && versions.length > 0) {
      const paths = versions.map((v) => v.storage_path);
      await supabase.storage.from('documents').remove(paths);
    }

    const { error: deleteError } = await (supabase as any)
      .from('baseball_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) throw deleteError;

    revalidatePath(DOCUMENTS_PATH);
    return { success: true as const };
  },
);

// ============================================
// VERSION MANAGEMENT
// ============================================

export async function uploadNewVersion(
  documentId: string,
  file: File,
  teamId?: string,
  coachId?: string,
  changeNotes?: string
): Promise<{
  success: boolean;
  version?: BaseballDocumentVersion & { file_url?: string };
  error?: string;
}> {
  try {
    return await uploadNewVersionAction(documentId, file, teamId, coachId, changeNotes);
  } catch (error) {
    return mapDocumentActionError(error);
  }
}

const uploadNewVersionAction = withBaseballAction(
  'uploadNewVersion',
  { featureArea: 'baseball-documents' },
  async (ctx, documentId: string, file: File, teamId?: string, _coachId?: string, changeNotes?: string) => {
    void _coachId;
    const supabase = await createClient();

    const { data: document, error: docError } = await (supabase as any)
      .from('baseball_documents')
      .select('team_id, version_count')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    await requireBaseballCapability(String(document.team_id), 'can_manage_documents');

    const effectiveTeamId = teamId || document.team_id;
    const newVersionNumber = (document.version_count || 1) + 1;

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `baseball-documents/${effectiveTeamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    const signedUrl = await signDocumentStoragePath(supabase, storagePath);

    const { data: version, error: versionError } = await (supabase as any)
      .from('baseball_document_versions')
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        change_notes: changeNotes || null,
        uploaded_by: ctx.user.id,
      })
      .select('*')
      .single();

    if (versionError) throw versionError;

    const { error: updateError } = await (supabase as any)
      .from('baseball_documents')
      .update({
        file_url: signedUrl,
        file_type: file.type,
        file_size: file.size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    const uploaderMap = await resolveUploaders(supabase, [ctx.user.id]);

    revalidatePath(DOCUMENTS_PATH);
    return {
      success: true as const,
      version: {
        ...(version as unknown as BaseballDocumentVersion),
        uploader: uploaderMap.get(ctx.user.id) ?? null,
        file_url: signedUrl,
        file_size: file.size,
      },
    };
  },
);

export async function getVersionHistory(
  documentId: string
): Promise<{ success: boolean; versions?: BaseballDocumentVersion[]; error?: string }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: rawData, error } = await (supabase as any)
      .from('baseball_document_versions')
      .select('*')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (error) throw error;

    const versionsData = (rawData as unknown as BaseballDocumentVersion[] | null) || [];
    const uploaderMap = await resolveUploaders(supabase, versionsData.map((v) => v.uploaded_by));

    const versionsWithUrls = await Promise.all(
      versionsData.map(async (version) => ({
        ...version,
        uploader: uploaderMap.get(version.uploaded_by ?? '') ?? null,
        file_url: await signDocumentStoragePath(supabase, version.storage_path),
      })),
    );

    return { success: true, versions: versionsWithUrls as BaseballDocumentVersion[] };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

export async function revertToVersion(
  documentId: string,
  versionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get the version to revert to by ID
    const { data: versionData, error: versionError } = await (supabase as any)
      .from('baseball_document_versions')
      .select('*')
      .eq('document_id', documentId)
      .eq('id', versionId)
      .single();

    if (versionError) throw versionError;
    const version = versionData as unknown as BaseballDocumentVersion;

    // Get current document version number
    const { data: document, error: docError } = await (supabase as any)
      .from('baseball_documents')
      .select('version_count, team_id')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    await requireBaseballCapability(String(document.team_id), 'can_manage_documents');

    const newVersionNumber = (document.version_count || 1) + 1;

    const signedUrl = await signDocumentStoragePath(supabase, version.storage_path);

    // Create new version record (revert is a new version)
    const { error: newVersionError } = await (supabase as any)
      .from('baseball_document_versions')
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        file_name: version.file_name,
        file_size: version.file_size,
        mime_type: version.mime_type,
        storage_path: version.storage_path,
        change_notes: `Reverted to version ${version.version_number}`,
        uploaded_by: user.id,
      });

    if (newVersionError) throw newVersionError;

    // Update main document
    const { error: updateError } = await (supabase as any)
      .from('baseball_documents')
      .update({
        file_url: signedUrl,
        file_type: version.mime_type,
        file_size: version.file_size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    revalidatePath(DOCUMENTS_PATH);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

// ============================================
// PREVIEW URL GENERATION
// ============================================

export async function getPreviewUrl(
  documentId: string,
  versionNumber?: number
): Promise<{ data: { url: string; mimeType: string } | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { data: null, error: 'Not authenticated' };
    }

    if (versionNumber) {
      // Get specific version
      const { data: versionData, error } = await (supabase as any)
        .from('baseball_document_versions')
        .select('storage_path, mime_type')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;
      const version = versionData as unknown as { storage_path: string; mime_type: string };

      const signedUrl = await signDocumentStoragePath(supabase, version.storage_path);

      return {
        data: { url: signedUrl, mimeType: version.mime_type },
        error: null,
      };
    }

    const { data: latestVersion, error: versionLookupError } = await (supabase as any)
      .from('baseball_document_versions')
      .select('storage_path, mime_type')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (versionLookupError || !latestVersion) {
      throw versionLookupError ?? new Error('No version found for document');
    }

    const latest = latestVersion as unknown as { storage_path: string; mime_type: string };
    const signedUrl = await signDocumentStoragePath(supabase, latest.storage_path);

    return {
      data: {
        url: signedUrl,
        mimeType: latest.mime_type || 'application/octet-stream',
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function getTextFileContent(
  documentId: string,
  versionNumber?: number
): Promise<{ data: string | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { data: null, error: 'Not authenticated' };
    }

    let storagePath: string;

    if (versionNumber) {
      const { data: versionData, error } = await (supabase as any)
        .from('baseball_document_versions')
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;
      const version = versionData as unknown as { storage_path: string };
      storagePath = version.storage_path;
    } else {
      // Get latest version
      const { data: document, error } = await (supabase as any)
        .from('baseball_documents')
        .select('version_count')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      const { data: versionData, error: vError } = await (supabase as any)
        .from('baseball_document_versions')
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', document.version_count)
        .single();

      if (vError) throw vError;
      const version = versionData as unknown as { storage_path: string };
      storagePath = version.storage_path;
    }

    // Download file content
    const { data, error } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (error) throw error;

    const text = await data.text();
    return { data: text, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}
