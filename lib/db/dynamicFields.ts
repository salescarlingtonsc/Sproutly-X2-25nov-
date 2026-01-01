
import { supabase } from '../supabase';
import { FieldDefinition } from '../../types';

export const getFieldDefinitions = async (): Promise<FieldDefinition[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('field_definitions').select('*').order('created_at');
  return error ? [] : data;
};

export const createFieldDefinition = async (field: Omit<FieldDefinition, 'id'>) => {
  if (!supabase) return;
  
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  
  const { data, error } = await supabase
    .from('field_definitions')
    .insert({ ...field, user_id: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const upsertFieldValue = async (clientId: string, fieldId: string, type: string, value: any) => {
  if (!supabase) return;
  
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  const payload: any = {
    client_id: clientId,
    field_id: fieldId,
    user_id: user?.id,
    updated_at: new Date().toISOString()
  };

  // Reset typed columns
  payload.value_text = null; payload.value_number = null; payload.value_bool = null; payload.value_date = null;

  if (type === 'number' || type === 'currency') payload.value_number = parseFloat(value);
  else if (type === 'boolean') payload.value_bool = !!value;
  else if (type === 'date') payload.value_date = value;
  else payload.value_text = value;

  const { error } = await supabase
    .from('client_field_values')
    .upsert(payload, { onConflict: 'client_id, field_id' });

  if (error) throw error;
};
