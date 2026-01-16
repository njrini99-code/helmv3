'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { GolfDocument, DocumentVersion, VersionComparison } from '@/lib/types/golf';

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

    const { data, error } = await supabase
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
      data.versions.sort((a: DocumentVersion, b: DocumentVersion) => b.version_number - a.version_number);
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
        player_visible: options.playerVisible ?? true,
        uploaded_by: user.id,
        current_version: 1,
        original_file_name: file.name,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Create initial version record
    const { error: versionError } = await supabase
      .from('golf_document_versions')
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
        player_visible: updates.playerVisible,
        updated_at: new Date().toISOString(),
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
    const { data: document, error: fetchError } = await supabase
      .from('golf_documents')
      .select('file_url, team_id')
      .eq('id', documentId)
      .single();

    if (fetchError) throw fetchError;

    // Get all versions for cleanup
    const { data: versions } = await supabase
      .from('golf_document_versions')
      .select('storage_path')
      .eq('document_id', documentId);

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
  changeNotes?: string
): Promise<{ data: DocumentVersion | null; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get current document
    const { data: document, error: docError } = await supabase
      .from('golf_documents')
      .select('team_id, current_version')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    const newVersionNumber = (document.current_version || 1) + 1;

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
      .from('golf_document_versions')
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
        current_version: newVersionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) throw updateError;

    revalidatePath('/golf/dashboard/documents');
    return { data: version as DocumentVersion, error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function getDocumentVersions(documentId: string): Promise<{ data: DocumentVersion[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('golf_document_versions')
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

    return { data: data as DocumentVersion[], error: null };
  } catch (error) {
    return { data: null, error: handleError(error) };
  }
}

export async function revertToVersion(
  documentId: string,
  versionNumber: number
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Get the version to revert to
    const { data: version, error: versionError } = await supabase
      .from('golf_document_versions')
      .select('*')
      .eq('document_id', documentId)
      .eq('version_number', versionNumber)
      .single();

    if (versionError) throw versionError;

    // Get current document version number
    const { data: document, error: docError } = await supabase
      .from('golf_documents')
      .select('current_version, team_id')
      .eq('id', documentId)
      .single();

    if (docError) throw docError;

    const newVersionNumber = (document.current_version || 1) + 1;

    // Get public URL for the old version file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(version.storage_path);

    // Create new version record (revert is a new version)
    const { error: newVersionError } = await supabase
      .from('golf_document_versions')
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        file_name: version.file_name,
        file_size: version.file_size,
        mime_type: version.mime_type,
        storage_path: version.storage_path,
        change_notes: `Reverted to version ${versionNumber}`,
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
        current_version: newVersionNumber,
        updated_at: new Date().toISOString(),
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

    const { data: versions, error } = await supabase
      .from('golf_document_versions')
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
    if (!versions || versions.length !== 2) {
      throw new Error('Could not find both versions');
    }

    const v1 = versions.find(v => v.version_number === version1) as DocumentVersion;
    const v2 = versions.find(v => v.version_number === version2) as DocumentVersion;

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
      const { data: version, error } = await supabase
        .from('golf_document_versions')
        .select('storage_path, mime_type')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;

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

      return { data: { url: document.file_url, mimeType: document.file_type }, error: null };
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
      const { data: version, error } = await supabase
        .from('golf_document_versions')
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', versionNumber)
        .single();

      if (error) throw error;
      storagePath = version.storage_path;
    } else {
      // Get latest version
      const { data: document, error } = await supabase
        .from('golf_documents')
        .select('current_version')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      const { data: version, error: vError } = await supabase
        .from('golf_document_versions')
        .select('storage_path')
        .eq('document_id', documentId)
        .eq('version_number', document.current_version)
        .single();

      if (vError) throw vError;
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
