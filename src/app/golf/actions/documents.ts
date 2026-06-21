/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses 'as any' casts for golf_document_versions table queries
// because the Supabase types need to be regenerated to include the table.
// Once `npm run db:types` is run against the active database, these casts can be removed.
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { GolfDocument, DocumentVersion, VersionComparison } from '@/lib/types/golf';
import { logServerError } from '@/lib/server-error-logger';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';

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
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// Derive the in-bucket storage object path from a Supabase public URL, used only
// as a fallback when an explicit storage_path was not supplied. A public URL is
// shaped `.../storage/v1/object/public/{bucket}/{objectPath}`; the object path is
// everything after the bucket segment ('documents'), e.g.
// 'golf-documents/{teamId}/{fileName}'. The previous `slice(-2)` heuristic
// silently dropped the 'golf-documents/' prefix and broke signed-URL resolution.
function deriveStoragePathFromPublicUrl(fileUrl: string): string {
  const marker = '/object/public/documents/';
  const idx = fileUrl.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]!);
  }
  // Last-resort fallback for unexpected URL shapes: keep the trailing three
  // segments ('golf-documents/{teamId}/{fileName}') rather than two, so the
  // bucket-prefix segment survives.
  const parts = fileUrl.split('?')[0]!.split('/');
  return decodeURIComponent(parts.slice(-3).join('/'));
}

// Resolve how the authenticated user relates to the team that owns a document.
// Returns 'coach' when the user is a coach STAFFED on the team (full read of
// coach-only docs), 'player' when the user is an active member of the team
// (public docs only), or 'none' when the user has no access at all. Read paths
// use the role to filter is_public for non-coach callers (defense-in-depth on
// top of RLS); mutation paths only care about coach-vs-none.
type TeamRole = 'coach' | 'player' | 'none';

async function resolveTeamRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teamId: string
): Promise<TeamRole> {
  // Check coach path: a coach may access a team's documents iff they are STAFFED
  // on that team (golf_team_coach_staff). Previously this authorized ANY team
  // sharing the coach's org, which leaked the other team's documents in a
  // two-team (men's/women's) program. Staff-strict: a director-of-golf staffed
  // on both teams can access both; a single-team coach only their own. Note this
  // checks STAFFING, not the active-team toggle — a coach can access any team
  // they staff regardless of which one is currently selected.
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (coach) {
    if (await validateCoachTeamAccess(supabase, coach.id, teamId, coach.organization_id)) return 'coach';
  }

  // Check player path: player is an active member of the team
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (player) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', player.id)
      .eq('team_id', teamId)
      .eq('status', 'active')
      .maybeSingle();
    if (membership) return 'player';
  }

  return 'none';
}

// Verify the authenticated user belongs to the team that owns the document.
// Thin wrapper over resolveTeamRole for callers that only need a boolean.
async function verifyTeamAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teamId: string
): Promise<boolean> {
  return (await resolveTeamRole(supabase, userId, teamId)) !== 'none';
}

// ============================================
// DOCUMENT CRUD OPERATIONS
// ============================================

export async function getDocuments(teamId: string): Promise<{ data: GolfDocument[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user belongs to this team
    const role = await resolveTeamRole(supabase, user.id, teamId);
    if (role === 'none') return { data: null, error: 'Not authorized to access this team\'s documents' };

    let query = supabase
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

    // Players only ever see public documents — never coach-only files. This
    // mirrors the page-level filter and the RLS policy (defense-in-depth).
    if (role !== 'coach') {
      query = query.eq('is_public', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as GolfDocument[], error: null };
  } catch (error) {
    await logServerError(
      `Unexpected error in getDocuments: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.getDocuments', featureArea: 'documents' }
    );
    return { data: null, error: handleError(error) };
  }
}

export async function getDocument(documentId: string): Promise<{ data: GolfDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: docCheck, error: docCheckError } = await supabase
      .from('golf_documents')
      .select('team_id, is_public')
      .eq('id', documentId)
      .single();

    if (docCheckError || !docCheck) return { data: null, error: 'Document not found' };

    const role = await resolveTeamRole(supabase, user.id, docCheck.team_id);
    if (role === 'none') return { data: null, error: 'Not authorized to access this document' };

    // A player can never read a coach-only document, even by id. RLS now blocks
    // this at the DB; the action filters too (defense-in-depth + honest error).
    if (role !== 'coach' && docCheck.is_public !== true) {
      return { data: null, error: 'Not authorized to access this document' };
    }

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
    await logServerError(
      `Unexpected error in getDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.getDocument', featureArea: 'documents' }
    );
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

    // Create initial version record. file_url is NOT NULL in
    // golf_document_versions, so it must be supplied here (omitting it throws a
    // not-null violation). Reuse the public URL already derived for the document.
    const { error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: document.id,
        version_number: 1,
        file_url: urlData.publicUrl,
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
    await logServerError(
      `Unexpected error in createDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.createDocument', featureArea: 'documents' }
    );
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
    folder?: string | null;
  }
): Promise<{ data: GolfDocument | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: doc, error: docError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docError || !doc) return { data: null, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, doc.team_id);
    if (!hasAccess) return { data: null, error: 'Not authorized to modify this document' };

    const updatePayload: {
      title?: string;
      description?: string;
      category?: string;
      is_public?: boolean;
      folder?: string | null;
    } = {};
    if (updates.title !== undefined) updatePayload.title = updates.title;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.category !== undefined) updatePayload.category = updates.category;
    if (updates.playerVisible !== undefined) updatePayload.is_public = updates.playerVisible;
    if (updates.folder !== undefined) updatePayload.folder = updates.folder;

    const { data, error } = await supabase
      .from('golf_documents')
      .update(updatePayload)
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/golf/dashboard/documents');
    return { data: data as GolfDocument, error: null };
  } catch (error) {
    await logServerError(
      `Unexpected error in updateDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.updateDocument', featureArea: 'documents' }
    );
    return { data: null, error: handleError(error) };
  }
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    // Get document to find storage paths

    const { data: _document, error: fetchError } = await supabase
      .from('golf_documents')
      .select('file_url, team_id')
      .eq('id', documentId)
      .single();

    if (fetchError) throw fetchError;

    // Verify user has access to this document's team
    const hasAccess = await verifyTeamAccess(supabase, user.id, _document.team_id);
    if (!hasAccess) return { success: false, error: 'Not authorized to delete this document' };

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
    await logServerError(
      `Unexpected error in deleteDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.deleteDocument', featureArea: 'documents' }
    );
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

    // Create version record. file_url is NOT NULL in golf_document_versions,
    // so it must be supplied here (omitting it throws a not-null violation and
    // breaks "Upload new version" entirely). Derive it the same way
    // createGolfDocument does, from the just-uploaded storage path.
    const { data: version, error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        file_url: urlData.publicUrl,
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
    await logServerError(
      `Unexpected error in uploadNewVersion: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.uploadNewVersion', featureArea: 'documents' }
    );
    return { success: false, error: handleError(error) };
  }
}

export async function getDocumentVersions(documentId: string): Promise<{ data: DocumentVersion[] | null; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: docCheck, error: docCheckError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docCheckError || !docCheck) return { data: null, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, docCheck.team_id);
    if (!hasAccess) return { data: null, error: 'Not authorized to access this document' };

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
    await logServerError(
      `Unexpected error in getDocumentVersions: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.getDocumentVersions', featureArea: 'documents' }
    );
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

    // Create new version record (revert is a new version). file_url is NOT NULL
    // in golf_document_versions, so it must be supplied here (omitting it throws
    // a not-null violation). Reuse the public URL derived from the reverted
    // version's storage path.
    const { error: newVersionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: documentId,
        version_number: newVersionNumber,
        file_url: urlData.publicUrl,
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
    await logServerError(
      `Unexpected error in revertToVersion: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.revertToVersion', featureArea: 'documents' }
    );
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: docCheck, error: docCheckError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docCheckError || !docCheck) return { data: null, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, docCheck.team_id);
    if (!hasAccess) return { data: null, error: 'Not authorized to access this document' };

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
    await logServerError(
      `Unexpected error in compareVersions: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.compareVersions', featureArea: 'documents' }
    );
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: docCheck, error: docCheckError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docCheckError || !docCheck) return { data: null, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, docCheck.team_id);
    if (!hasAccess) return { data: null, error: 'Not authorized to access this document' };

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
      // Get latest version's storage_path — `documents` bucket is private,
      // so we always issue a short-lived signed URL instead of returning the
      // stored file_url (which was a public URL pre-LIVE-29).
      const { data: latestVersion, error: versionLookupError } = await supabase
        .from('golf_document_versions' as any)
        .select('storage_path, mime_type')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      if (versionLookupError || !latestVersion) {
        throw versionLookupError ?? new Error('No version found for document');
      }
      const version = latestVersion as unknown as Pick<DocumentVersionRow, 'storage_path' | 'mime_type'>;

      const { data: signedUrl, error: signError } = await supabase.storage
        .from('documents')
        .createSignedUrl(version.storage_path, 3600);

      if (signError) throw signError;

      return {
        data: {
          url: signedUrl.signedUrl,
          mimeType: version.mime_type || 'application/octet-stream',
        },
        error: null,
      };
    }
  } catch (error) {
    await logServerError(
      `Unexpected error in getPreviewUrl: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.getPreviewUrl', featureArea: 'documents' }
    );
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
): Promise<{ success: boolean; file_url?: string; storage_path?: string; error?: string }> {
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

    // Return the real storage_path verbatim so createGolfDocument can persist it
    // exactly. Reconstructing it from the public URL drops the 'golf-documents/'
    // bucket-prefix segment, which then breaks createSignedUrl on preview/download.
    return { success: true, file_url: urlData.publicUrl, storage_path: storagePath };
  } catch (error) {
    await logServerError(
      `Unexpected error in uploadGolfDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.uploadGolfDocument', featureArea: 'documents' }
    );
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
  folder?: string;
  // Real storage object path (e.g. 'golf-documents/{teamId}/{fileName}') returned
  // by uploadGolfDocument. Persisted verbatim so preview/download can sign it.
  storage_path?: string;
}): Promise<{ success: boolean; data?: GolfDocument; error?: string }> {
  try {
    const supabase = await createClient();

    // Get authenticated user ID (uploaded_by now references auth.users)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

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
        uploaded_by: user.id,
        version_count: 1,
        folder: data.folder || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Resolve the storage object path for the version record. Prefer the real
    // path passed from uploadGolfDocument. Only fall back to deriving it from the
    // public URL when absent — and derive it correctly by taking everything after
    // the bucket name ('documents'), which preserves the 'golf-documents/' prefix.
    // The old `slice(-2)` dropped that prefix, so createSignedUrl(storage_path)
    // later resolved to a non-existent object and preview/download silently failed.
    const storagePath = data.storage_path ?? deriveStoragePathFromPublicUrl(data.file_url);

    // Create initial version record
    const { error: versionError } = await supabase
      .from('golf_document_versions' as any)
      .insert({
        document_id: document.id,
        version_number: 1,
        file_url: data.file_url,
        file_name: data.title,
        file_size: data.file_size,
        mime_type: data.file_type,
        storage_path: storagePath,
        change_notes: 'Initial upload',
        uploaded_by: user.id,
      });

    if (versionError) {
      // Version record creation failed but don't fail the whole operation
    }

    revalidatePath('/golf/dashboard/documents');
    return { success: true, data: document as GolfDocument };
  } catch (error) {
    await logServerError(
      `Unexpected error in createGolfDocument: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.createGolfDocument', featureArea: 'documents' }
    );
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
  folder?: string | null;
}): Promise<{ success: boolean; data?: GolfDocument; error?: string }> {
  const result = await updateDocument(data.id, {
    title: data.title,
    description: data.description,
    category: data.category,
    playerVisible: data.player_visible,
    folder: data.folder,
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: doc, error: docAccessError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docAccessError || !doc) return { success: false, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, doc.team_id);
    if (!hasAccess) return { success: false, error: 'Not authorized to delete this version' };

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
    await logServerError(
      `Unexpected error in deleteVersion: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.deleteVersion', featureArea: 'documents' }
    );
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    // Verify user has access to this document's team
    const { data: docCheck, error: docCheckError } = await supabase
      .from('golf_documents')
      .select('team_id')
      .eq('id', documentId)
      .single();

    if (docCheckError || !docCheck) return { data: null, error: 'Document not found' };

    const hasAccess = await verifyTeamAccess(supabase, user.id, docCheck.team_id);
    if (!hasAccess) return { data: null, error: 'Not authorized to access this document' };

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
    await logServerError(
      `Unexpected error in getTextFileContent: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'documents.getTextFileContent', featureArea: 'documents' }
    );
    return { data: null, error: handleError(error) };
  }
}
