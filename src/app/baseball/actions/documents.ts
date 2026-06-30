/* eslint-disable @typescript-eslint/no-explicit-any */
// Untyped document/version queries go through `(supabase as any)` until database.ts
// includes baseball_documents + baseball_document_versions (regen via npm run db:types).
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';

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

export async function getTeamDocuments(
  teamId: string,
  isCoach: boolean
): Promise<{ data: BaseballDocument[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('baseball_documents' as any)
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    // Players can only see documents where is_player_visible = true
    if (!isCoach) {
      query = query.eq('is_player_visible', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as unknown as BaseballDocument[], error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function getDocument(
  documentId: string
): Promise<{ data: BaseballDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await (supabase as any)
      .from('baseball_documents')
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        ),
        versions:baseball_document_versions(
          *,
          uploader:uploaded_by(
            full_name,
            email
          )
        )
      `)
      .eq('id', documentId)
      .single();

    if (error) throw error;

    // Sort versions by version number descending
    if (data?.versions) {
      (data.versions as BaseballDocumentVersion[]).sort(
        (a: BaseballDocumentVersion, b: BaseballDocumentVersion) =>
          b.version_number - a.version_number
      );
    }

    return { data: data as BaseballDocument, error: null };
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
): Promise<{ success: boolean; file_url?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `baseball-documents/${teamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    return { success: true, file_url: urlData.publicUrl };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

/**
 * Create a document record (after file has been uploaded)
 */
export async function createBaseballDocument(data: {
  team_id: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size: number;
  category?: string;
  is_player_visible: boolean;
  uploaded_by: string;
  folder?: string;
}): Promise<{ success: boolean; data?: BaseballDocument; error?: string }> {
  try {
    const supabase = await createClient();

    // Get authenticated user ID
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    // Create document record
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
        uploaded_by: user.id,
        version_count: 1,
        folder: data.folder || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Extract storage path from file URL for version record
    const urlParts = data.file_url.split('/');
    const storagePath = urlParts.slice(-3).join('/');

    // Create initial version record
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
        uploaded_by: user.id,
      });

    if (versionError) {
      await logServerError(`Failed to create version record: ${versionError instanceof Error ? versionError.message : String(versionError)}`, { action: 'documents.createBaseballDocument' });
      // Don't fail the whole operation if version record fails
    }

    revalidatePath('/baseball/dashboard/documents');
    return { success: true, data: document as BaseballDocument };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

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
    const supabase = await createClient();

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

    revalidatePath('/baseball/dashboard/documents');
    return { success: true, data: document as BaseballDocument };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

export async function deleteBaseballDocument(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Get all versions for cleanup
    const { data: versionsData } = await (supabase as any)
      .from('baseball_document_versions')
      .select('storage_path')
      .eq('document_id', documentId);
    const versions = versionsData as { storage_path: string }[] | null;

    // Delete from storage (all versions)
    if (versions && versions.length > 0) {
      const paths = versions.map((v) => v.storage_path);
      await supabase.storage.from('documents').remove(paths);
    }

    // Delete document (cascade will delete versions)
    const { error: deleteError } = await (supabase as any)
      .from('baseball_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) throw deleteError;

    revalidatePath('/baseball/dashboard/documents');
    return { success: true };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

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
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get current document
    const { data: document, error: docError } = await (supabase as any)
      .from('baseball_documents')
      .select('team_id, version_count')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    const effectiveTeamId = teamId || document.team_id;
    const newVersionNumber = (document.version_count || 1) + 1;

    // Upload new file
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `baseball-documents/${effectiveTeamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Create version record
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
        uploaded_by: user.id,
      })
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        )
      `)
      .single();

    if (versionError) throw versionError;

    // Update main document with new version info
    const { error: updateError } = await (supabase as any)
      .from('baseball_documents')
      .update({
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    // Suppress unused variable warnings for optional params
    void coachId;

    revalidatePath('/baseball/dashboard/documents');
    return {
      success: true,
      version: {
        ...(version as unknown as BaseballDocumentVersion),
        file_url: urlData.publicUrl,
        file_size: file.size,
      },
    };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

export async function getVersionHistory(
  documentId: string
): Promise<{ success: boolean; versions?: BaseballDocumentVersion[]; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: rawData, error } = await (supabase as any)
      .from('baseball_document_versions')
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        )
      `)
      .eq('document_id', documentId)
      .order('version_number', { ascending: false });

    if (error) throw error;

    const versionsData = rawData as unknown as BaseballDocumentVersion[] | null;

    // Add file_url to each version
    const versionsWithUrls = (versionsData || []).map((version) => {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(version.storage_path);
      return {
        ...version,
        file_url: urlData.publicUrl,
      };
    });

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

    const newVersionNumber = (document.version_count || 1) + 1;

    // Get public URL for the old version file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(version.storage_path);

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
        file_url: urlData.publicUrl,
        file_type: version.mime_type,
        file_size: version.file_size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    revalidatePath('/baseball/dashboard/documents');
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

      // Generate signed URL for preview (expires in 1 hour)
      const { data: signedUrl, error: signError } = await supabase.storage
        .from('documents')
        .createSignedUrl(version.storage_path, 3600);

      if (signError) throw signError;

      return {
        data: { url: signedUrl.signedUrl, mimeType: version.mime_type },
        error: null,
      };
    } else {
      // Get current version from document
      const { data: document, error } = await (supabase as any)
        .from('baseball_documents')
        .select('file_url, file_type')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      return {
        data: {
          url: document.file_url,
          mimeType: document.file_type || 'application/octet-stream',
        },
        error: null,
      };
    }
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
