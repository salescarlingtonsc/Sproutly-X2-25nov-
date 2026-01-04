
import { supabase } from '../supabase';

export interface KnowledgeItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  verified_by?: string;
  votes: number;
  created_at?: string;
}

export const aiLearning = {
  // 1. Train: Save a new "verified" Q&A pair
  train: async (question: string, answer: string, category: string = 'general') => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("User must be logged in to train AI.");

      const { error } = await supabase.from('sproutly_knowledge').insert({
        question,
        answer,
        category,
        verified_by: session.user.id,
        votes: 1
      });

      if (error) {
        // Handle missing table specifically
        if (error.code === '42P01') {
            throw new Error("System Table Missing: Please go to 'Admin' > 'DB Repair' and run the script.");
        }
        throw error;
      }
      console.log('Sproutly AI trained with new insight.');
    } catch (e: any) {
      console.error('Training failed:', e);
      throw new Error(e.message || "Failed to save knowledge. Check console.");
    }
  },

  // 2. Fetch Context: Get top insights to inject into context (RAG)
  getKnowledge: async (limit: number = 10): Promise<string> => {
    if (!supabase) return '';
    try {
      const { data, error } = await supabase
        .from('sproutly_knowledge')
        .select('question, answer')
        .order('votes', { ascending: false }) // Prioritize high-vote items
        .limit(limit);

      if (error) {
         // Silent fail for RAG context if table missing or error
         return '';
      }
      if (!data) return '';

      const knowledgeString = data.map((item: any) => 
        `Q: ${item.question}\nA: ${item.answer}`
      ).join('\n\n');

      return knowledgeString ? `\n\n[VERIFIED ORGANIZATIONAL KNOWLEDGE]:\n${knowledgeString}\n` : '';
    } catch (e) {
      return '';
    }
  },

  // 3. Get All (For Admin)
  getAllKnowledge: async (): Promise<KnowledgeItem[]> => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('sproutly_knowledge')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === '42P01') {
            console.warn("Knowledge base table not found. Please run the Repair Script in the Admin tab.");
            return []; // Return empty array gracefully instead of throwing
        }
        console.error("Failed to fetch knowledge:", JSON.stringify(error, null, 2));
        return [];
      }
      return data as KnowledgeItem[];
    } catch (err) {
      console.error("Unexpected error fetching knowledge:", err);
      return [];
    }
  },

  // 4. Update
  updateKnowledge: async (id: string, updates: Partial<KnowledgeItem>) => {
    if (!supabase) return;
    const { error } = await supabase.from('sproutly_knowledge').update(updates).eq('id', id);
    if (error) throw error;
  },

  // 5. Delete
  deleteKnowledge: async (id: string) => {
    if (!supabase) return;
    
    // HARDENED: Select returned rows
    const { error, data } = await supabase
      .from('sproutly_knowledge')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    
    if (!data || data.length === 0) {
      throw new Error("Deletion failed: Item not found or access denied.");
    }
  }
};
