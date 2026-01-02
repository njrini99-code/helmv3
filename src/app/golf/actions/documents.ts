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
    console.error('Error creating golf document:', error);
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
    console.error('Error updating golf document:', error);
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
    console.error('Error deleting golf document:', dbError);
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
    console.error('Error deleting file from storage:', storageError);
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
    console.error('Error uploading file:', error);
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
