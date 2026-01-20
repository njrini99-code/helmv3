/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses 'as any' casts for golf_document_versions table queries
// because the Supabase types need to be regenerated to include the table.
// Once `npm run db:types` is run against the active database, these casts can be removed.
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { GolfDocument, DocumentVersion, VersionComparison } from '@/lib/types/golf';

// Type helper for golf_document_versions table (until types are regenerated)
interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  change_notes: string | null;
  uploaded_by: string | null;
  created_by?: string | null;
  created_at: string | null;
  uploader?: {
    full_name: string | null;
    email: string | null;
  } | null;
}

// Error handling helper
function handleError(error: unknown): string {
  console.error('Document action error:', error);
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// ============================================
// DOCUMENT CRUD OPERATIONS
// ============================================

export async function getDocuments(teamId: string): Promise<{ data: GolfDocument[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('golf_documents')
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        )
      `)
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return { data: data as GolfDocument[], error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function getDocument(documentId: string): Promise<{ data: GolfDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_documents')
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        ),
        versions:golf_document_versions(
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
      (data.versions as DocumentVersion[]).sort((a: DocumentVersion, b: DocumentVersion) => b.version_number - a.version_number);
    }

    return { data: data as GolfDocument, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function createDocument(
  teamId: string,
  title: string,
  file: File,
  options: {
    description?: string;
    category?: string;
    playerVisible?: boolean;
  } = {}
): Promise<{ data: GolfDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `golf-documents/${teamId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Create document record
    const { data: document, error: insertError } = await supabase
      .from('golf_documents')
      .insert({
        team_id: teamId,
        title,
        description: options.description || null,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        category: options.category || 'other',
        is_public: options.playerVisible ?? true,
        uploaded_by: user.id,
        version_count: 1,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Create initial version record
    const { error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: document.id,
        version_number: 1,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        change_notes: 'Initial upload',
        uploaded_by: user.id,
      });

    if (versionError) throw versionError;

    revalidatePath('/golf/dashboard/documents');
    return { data: document as GolfDocument, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function updateDocument(
  documentId: string,
  updates: {
    title?: string;
    description?: string;
    category?: string;
    playerVisible?: boolean;
  }
): Promise<{ data: GolfDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('golf_documents')
      .update({
        title: updates.title,
        description: updates.description,
        category: updates.category,
        is_public: updates.playerVisible,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/golf/dashboard/documents');
    return { data: data as GolfDocument, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get document to find storage paths
    const { data: _document, error: fetchError } = await supabase
      .from('golf_documents')
      .select('file_url, team_id')
      .eq('id', documentId)
      .single();

    if (fetchError) throw fetchError;

    // Get all versions for cleanup
    const { data: versionsData } = await supabase
      .from('golf_document_versions' as any)
      .select('storage_path')
      .eq('document_id', documentId);
    const versions = versionsData as Pick<DocumentVersionRow, 'storage_path'>[] | null;

    // Delete from storage (all versions)
    if (versions && versions.length > 0) {
      const paths = versions.map(v => v.storage_path);
      await supabase.storage.from('documents').remove(paths);
    }

    // Delete document (cascade will delete versions)
    const { error: deleteError } = await supabase
      .from('golf_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) throw deleteError;

    revalidatePath('/golf/dashboard/documents');
    return { success: true, error: null };
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
  _teamId?: string,  // Not used, kept for backwards compatibility
  _coachId?: string, // Not used, uses authenticated user
  changeNotes?: string
): Promise<{ success: boolean; version?: DocumentVersion & { file_url?: string }; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get current document
    const { data: document, error: docError } = await supabase
      .from('golf_documents')
      .select('team_id, version_count')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    const newVersionNumber = (document.version_count || 1) + 1;

    // Upload new file
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `golf-documents/${document.team_id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Create version record
    const { data: version, error: versionError } = await supabase
      .from('golf_document_versions' as any)
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
    const { error: updateError } = await supabase
      .from('golf_documents')
      .update({
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    revalidatePath('/golf/dashboard/documents');
    return {
      success: true,
      version: {
        ...(version as unknown as DocumentVersion),
        file_url: urlData.publicUrl,
        file_size: file.size,
      }
    };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

export async function getDocumentVersions(documentId: string): Promise<{ data: DocumentVersion[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: rawData, error } = await supabase
      .from('golf_document_versions' as any)
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

    // Cast to proper type
    const versionsData = rawData as unknown as DocumentVersionRow[] | null;

    // Add file_url to each version
    const versionsWithUrls = (versionsData || []).map(version => {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(version.storage_path);
      return {
        ...version,
        file_url: urlData.publicUrl,
      };
    });

    return { data: versionsWithUrls as DocumentVersion[], error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function revertToVersion(
  documentId: string,
  versionId: string,
  _coachId?: string  // Not used, uses authenticated user
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get the version to revert to by ID
    const { data: versionData, error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .select('*')
      .eq('document_id', documentId)
      .eq('id', versionId)
      .single();

    if (versionError) throw versionError;
    const version = versionData as unknown as DocumentVersionRow;

    // Get current document version number
    const { data: document, error: docError } = await supabase
      .from('golf_documents')
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
    const { error: newVersionError } = await supabase
      .from('golf_document_versions' as any)
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
    const { error: updateError } = await supabase
      .from('golf_documents')
      .update({
        file_url: urlData.publicUrl,
        file_type: version.mime_type,
        file_size: version.file_size,
        version_count: newVersionNumber,
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    revalidatePath('/golf/dashboard/documents');
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

export async function compareVersions(
  documentId: string,
  version1: number,
  version2: number
): Promise<{ data: VersionComparison | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: versionsData, error } = await supabase
      .from('golf_document_versions' as any)
      .select(`
        *,
        uploader:uploaded_by(
          full_name,
          email
        )
      `)
      .eq('document_id', documentId)
      .in('version_number', [version1, version2]);

    if (error) throw error;
    const versions = versionsData as unknown as DocumentVersionRow[] | null;
    if (!versions || versions.length !== 2) {
      throw new Error('Could not find both versions');
    }

    const v1 = versions.find(v => v.version_number === version1) as unknown as DocumentVersion;
    const v2 = versions.find(v => v.version_number === version2) as unknown as DocumentVersion;

    const date1 = new Date(v1.created_at);
    const date2 = new Date(v2.created_at);
    const daysBetween = Math.abs(Math.ceil((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      data: {
        version1: v1,
        version2: v2,
        sizeDiff: v2.file_size - v1.file_size,
        daysBetween,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: handleError(error) };
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
      const { data: versionData, error } = await supabase
        .from('golf_document_versions' as any)
        .select('storage_path, mime_type')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;
      const version = versionData as unknown as Pick<DocumentVersionRow, 'storage_path' | 'mime_type'>;

      // Generate signed URL for preview (expires in 1 hour)
      const { data: signedUrl, error: signError } = await supabase.storage
        .from('documents')
        .createSignedUrl(version.storage_path, 3600);

      if (signError) throw signError;

      return { data: { url: signedUrl.signedUrl, mimeType: version.mime_type }, error: null };
    } else {
      // Get current version from document
      const { data: document, error } = await supabase
        .from('golf_documents')
        .select('file_url, file_type')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      return { data: { url: document.file_url, mimeType: document.file_type || 'application/octet-stream' }, error: null };
    }
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

// ============================================
// EXPORT ALIASES for backwards compatibility
// ============================================

/**
 * Upload a file to storage (separate from creating the document record)
 * Returns { success, file_url, error }
 */
export async function uploadGolfDocument(
  file: File,
  teamId: string
): Promise<{ success: boolean; file_url?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Upload file to storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `golf-documents/${teamId}/${fileName}`;

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
 * Returns { success, data, error }
 */
export async function createGolfDocument(data: {
  team_id: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size: number;
  category?: string;
  player_visible: boolean;
  uploaded_by: string;
}): Promise<{ success: boolean; data?: GolfDocument; error?: string }> {
  try {
    const supabase = await createClient();

    // Create document record
    const { data: document, error: insertError } = await supabase
      .from('golf_documents')
      .insert({
        team_id: data.team_id,
        title: data.title,
        description: data.description || null,
        file_url: data.file_url,
        file_type: data.file_type,
        file_size: data.file_size,
        category: data.category || 'other',
        is_public: data.player_visible,
        uploaded_by: data.uploaded_by,
        version_count: 1,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Extract storage path from file URL for version record
    const urlParts = data.file_url.split('/');
    const storagePath = urlParts.slice(-2).join('/');

    // Create initial version record
    const { error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: document.id,
        version_number: 1,
        file_name: data.title,
        file_size: data.file_size,
        mime_type: data.file_type,
        storage_path: storagePath,
        change_notes: 'Initial upload',
        uploaded_by: data.uploaded_by,
      });

    if (versionError) {
      console.error('Failed to create version record:', versionError);
      // Don't fail the whole operation if version record fails
    }

    revalidatePath('/golf/dashboard/documents');
    return { success: true, data: document as GolfDocument };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

/**
 * Delete a document and all its versions
 */
export async function deleteGolfDocument(
  documentId: string,
  _filePath?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteDocument(documentId);
  return { success: result.success, error: result.error || undefined };
}

/**
 * Update a document's metadata
 */
export async function updateGolfDocument(data: {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  player_visible?: boolean;
}): Promise<{ success: boolean; data?: GolfDocument; error?: string }> {
  const result = await updateDocument(data.id, {
    title: data.title,
    description: data.description,
    category: data.category,
    playerVisible: data.player_visible,
  });
  return {
    success: !result.error,
    data: result.data || undefined,
    error: result.error || undefined
  };
}

/**
 * Get version history for a document
 * Returns { success, versions, error }
 */
export async function getVersionHistory(
  documentId: string
): Promise<{ success: boolean; versions?: DocumentVersion[]; error?: string }> {
  const result = await getDocumentVersions(documentId);
  if (result.error) {
    return { success: false, error: result.error };
  }
  return { success: true, versions: result.data || [] };
}

// Delete a specific version
export async function deleteVersion(
  documentId: string,
  versionId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get the version to delete by ID
    const { data: versionData, error: fetchError } = await supabase
      .from('golf_document_versions' as any)
      .select('storage_path, version_number')
      .eq('document_id', documentId)
      .eq('id', versionId)
      .single();

    if (fetchError) throw fetchError;
    const version = versionData as unknown as Pick<DocumentVersionRow, 'storage_path' | 'version_number'>;

    // Get current document version
    const { data: document, error: docError } = await supabase
      .from('golf_documents')
      .select('version_count')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    // Cannot delete current version
    if (document.version_count === version.version_number) {
      throw new Error('Cannot delete the current version');
    }

    // Delete from storage
    if (version.storage_path) {
      await supabase.storage.from('documents').remove([version.storage_path]);
    }

    // Delete version record
    const { error: deleteError } = await supabase
      .from('golf_document_versions' as any)
      .delete()
      .eq('document_id', documentId)
      .eq('id', versionId);

    if (deleteError) throw deleteError;

    revalidatePath('/golf/dashboard/documents');
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: handleError(error) };
  }
}

// Re-export type for backwards compatibility

export async function getTextFileContent(
  documentId: string,
  versionNumber?: number
): Promise<{ data: string | null; error: string | null }> {
  try {
    const supabase = await createClient();

    let storagePath: string;

    if (versionNumber) {
      const { data: versionData, error } = await supabase
        .from('golf_document_versions' as any)
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;
      const version = versionData as unknown as Pick<DocumentVersionRow, 'storage_path'>;
      storagePath = version.storage_path;
    } else {
      // Get latest version
      const { data: document, error } = await supabase
        .from('golf_documents')
        .select('version_count')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      const { data: versionData, error: vError } = await supabase
        .from('golf_document_versions' as any)
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', document.version_count)
        .single();

      if (vError) throw vError;
      const version = versionData as unknown as Pick<DocumentVersionRow, 'storage_path'>;
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
