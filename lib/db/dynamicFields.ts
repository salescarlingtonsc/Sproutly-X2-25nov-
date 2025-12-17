
import { supabase } from '../supabase';
import { FieldDefinition } from '../../types';

export const getFieldDefinitions = async (): Promise<FieldDefinition[]> => {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('field_definitions')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching fields:', error);
    return [];
  }
  return data || [];
};

export const createFieldDefinition = async (field: Omit<FieldDefinition, 'id'>) => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('field_definitions')
    .insert({ ...field, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteFieldDefinition = async (id: string) => {
  if (!supabase) return;
  const { error } = await supabase.from('field_definitions').delete().eq('id', id);
  if (error) throw error;
};

export const getClientFieldValues = async (clientId: string) => {
  if (!supabase) return {};
  
  const { data, error } = await supabase
    .from('client_field_values')
    .select('*')
    .eq('client_id', clientId);

  if (error) {
    console.error('Error fetching values:', error);
    return {};
  }

  // Transform EAV to Object
  const map: Record<string, any> = {};
  data.forEach((row: any) => {
    // Pick the non-null value
    const val = row.value_text ?? row.value_num ?? row.value_date ?? row.value_bool;
    map[row.field_id] = val;
  });
  return map;
};

export const saveClientFieldValue = async (clientId: string, fieldId: string, type: string, value: any) => {
  if (!supabase) return;

  const payload: any = {
    client_id: clientId,
    field_id: fieldId,
    updated_at: new Date().toISOString()
  };

  // Reset all
  payload.value_text = null;
  payload.value_num = null;
  payload.value_date = null;
  payload.value_bool = null;

  // Set specific
  if (type === 'number' || type === 'currency') payload.value_num = parseFloat(value);
  else if (type === 'boolean') payload.value_bool = value === 'true' || value === true;
  else if (type === 'date') payload.value_date = value;
  else payload.value_text = value;

  const { error } = await supabase
    .from('client_field_values')
    .upsert(payload, { onConflict: 'client_id, field_id' });

  if (error) console.error('Save field error', error);
};
