
import { supabase } from '../supabase';

export interface DBTemplate {
  id: string;
  label: string;
  content: string;
  user_id?: string;
  created_at?: string;
}

// Helper to validate UUID format
const isValidUUID = (uuid: string) => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return re.test(uuid);
};

export const dbTemplates = {
  getTemplates: async (): Promise<DBTemplate[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) {
        // Broad check for missing table (code 42P01) or PostgREST schema cache errors
        const isMissingTable = 
          error.code === '42P01' || 
          error.message?.includes('not find the table') || 
          error.message?.includes('schema cache');

        if (isMissingTable) {
          // Log as warning rather than error to keep console clean for non-configured DBs
          console.warn("Supabase: 'message_templates' table not found. Using default fallback templates.");
          return [];
        }
        
        console.error("Error fetching templates:", error.message);
        return [];
      }
      return data || [];
    } catch (e: any) {
      // Handle edge cases where the table check might throw instead of returning an error object
      if (e.message?.includes('message_templates') || e.message?.includes('schema cache')) {
        return [];
      }
      console.error("Template fetch failure:", e.message);
      return [];
    }
  },

  saveTemplate: async (template: Partial<DBTemplate>) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Ensure the ID is a valid UUID. 
    // Default templates use IDs like 'default_zoom' which causes database errors.
    // If invalid, we generate a fresh UUID to ensure it saves as a new custom template.
    const finalId = template.id && isValidUUID(template.id) 
      ? template.id 
      : crypto.randomUUID();

    // Explicitly picking columns to avoid RLS/Schema errors from UI-only properties
    const payload = {
      id: finalId,
      user_id: user.id,
      label: template.label || 'Untitled Protocol',
      content: template.content || '',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('message_templates')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      if (error.code === '42P01' || error.message?.includes('not find')) {
        throw new Error("Missing Database Table: 'message_templates'. Please run the SQL Setup in the Admin tab.");
      }
      console.error("Template save error:", error.message);
      throw error;
    }
    return data;
  },

  deleteTemplate: async (id: string) => {
    if (!supabase) return;
    // Safety: don't attempt to delete default string IDs from DB
    if (!isValidUUID(id)) return;
    
    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id);
    if (error) {
      console.error("Template delete error:", error.message);
      throw error;
    }
  }
};
