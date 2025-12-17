
import { supabase } from '../supabase';
import { ClientDocument } from '../../types';
import { logActivity } from './activities';

const BUCKET_NAME = 'client-docs';

export const uploadClientFile = async (clientId: string, file: File): Promise<ClientDocument | null> => {
  if (!supabase) return null;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // 1. Upload to Storage
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = `${user.id}/${clientId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Create DB Record
    const { data: dbData, error: dbError } = await supabase
      .from('client_files')
      .insert({
        client_id: clientId,
        uploader_id: user.id,
        name: file.name,
        size_bytes: file.size,
        mime_type: file.type,
        storage_path: filePath
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 3. Log Activity
    await logActivity(clientId, 'file_upload', `Uploaded file: ${file.name}`);

    return {
      id: dbData.id,
      name: dbData.name,
      type: dbData.mime_type,
      size: dbData.size_bytes,
      path: dbData.storage_path,
      created_at: dbData.created_at
    };
  } catch (e) {
    console.error('File upload exception', e);
    throw e;
  }
};

export const getClientFiles = async (clientId: string): Promise<ClientDocument[]> => {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('client_files')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch files error:', error);
      return [];
    }

    // Generate Signed URLs for immediate access
    const filesWithUrls = await Promise.all(data.map(async (f: any) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(f.storage_path, 3600); // 1 hour expiry

      return {
        id: f.id,
        name: f.name,
        type: f.mime_type,
        size: f.size_bytes,
        path: f.storage_path,
        created_at: f.created_at,
        url: signed?.signedUrl
      };
    }));

    return filesWithUrls;
  } catch (e) {
    console.error('Fetch files exception', e);
    return [];
  }
};

export const deleteClientFile = async (fileId: string, storagePath: string, clientId: string) => {
  if (!supabase) return;

  try {
    // 1. Delete from DB
    const { error: dbError } = await supabase.from('client_files').delete().eq('id', fileId);
    if (dbError) throw dbError;

    // 2. Delete from Storage
    const { error: storageError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    if (storageError) console.error('Storage delete error', storageError);

    // 3. Log
    await logActivity(clientId, 'file_delete', 'Deleted a file');

  } catch (e) {
    console.error('Delete file exception', e);
    throw e;
  }
};
