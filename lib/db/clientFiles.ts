
import { supabase } from '../supabase';
import { logActivity } from './activities';

export const uploadClientFile = async (clientId: string, file: File, category: string = 'others') => {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const path = `${user.id}/${clientId}/${Date.now()}-${file.name}`;
  
  const { error: uploadError } = await supabase.storage
    .from('client-files')
    .upload(path, file);

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('client_files').insert({
    user_id: user.id,
    client_id: clientId,
    name: file.name,
    size_bytes: file.size,
    mime_type: file.type,
    storage_path: path,
    category: category // Point 4: Tagging support
  });

  if (dbError) throw dbError;

  await logActivity(clientId, 'file', `Uploaded ${category} document: ${file.name}`);
};

export const fetchClientFiles = async (clientId: string) => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('client_files')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return Promise.all(data.map(async (f) => {
     const { data: { publicUrl } } = supabase.storage.from('client-files').getPublicUrl(f.storage_path);
     return { ...f, url: publicUrl };
  }));
};
