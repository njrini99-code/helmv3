'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface CreateDocumentInput {
  team_id: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size: number;
  category?: string;
  player_visible: boolean;
  uploaded_by: string;
}

export interface UpdateDocumentInput {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  player_visible?: boolean;
}

const MAX_DOCUMENT_SIZE_MB = 2;
const MAX_DOCUMENT_SIZE_BYTES = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

/**
 * Create a new golf document
 */
export async function createGolfDocument(input: CreateDocumentInput) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_documents')
    .insert({
      team_id: input.team_id,
      title: input.title,
      description: input.description,
      file_url: input.file_url,
      file_type: input.file_type,
      file_size: input.file_size,
      category: input.category,
      player_visible: input.player_visible,
      uploaded_by: input.uploaded_by,
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath('/golf/dashboard/documents');

  return {
    success: true,
    data,
  };
}

/**
 * Update a golf document
 */
export async function updateGolfDocument(input: UpdateDocumentInput) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_documents')
    .update({
      title: input.title,
      description: input.description,
      category: input.category,
      player_visible: input.player_visible,
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  revalidatePath('/golf/dashboard/documents');

  return {
    success: true,
    data,
  };
}

/**
 * Delete a golf document (and remove file from storage)
 */
export async function deleteGolfDocument(documentId: string, filePath: string) {
  const supabase = await createClient();

  // Delete from database
  const { error: dbError } = await supabase
    .from('golf_documents')
    .delete()
    .eq('id', documentId);

  if (dbError) {
    return {
      success: false,
      error: dbError.message,
    };
  }

  // Delete file from storage
  const { error: storageError } = await supabase
    .storage
    .from('golf-documents')
    .remove([filePath]);

  if (storageError) {
    // Document deleted but file remains - not critical
  }

  revalidatePath('/golf/dashboard/documents');

  return {
    success: true,
  };
}

/**
 * Upload a file to golf documents storage
 */
export async function uploadGolfDocument(
  file: File,
  teamId: string
): Promise<{ success: boolean; file_url?: string; file_path?: string; error?: string }> {
  const supabase = await createClient();

  if (!file.type || !ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error: 'Unsupported file type. Please upload a PDF, image, office document, or approved video format.',
    };
  }

  if (file.size <= 0 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      success: false,
      error: `File size must be between 1 byte and ${MAX_DOCUMENT_SIZE_MB}MB.`,
    };
  }

  // Generate unique file name
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filePath = `${teamId}/${fileName}`;

  // Upload to storage
  const { error } = await supabase
    .storage
    .from('golf-documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  // Get public URL
  const { data: { publicUrl } } = supabase
    .storage
    .from('golf-documents')
    .getPublicUrl(filePath);

  return {
    success: true,
    file_url: publicUrl,
    file_path: filePath,
  };
}
