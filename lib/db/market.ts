
import { supabase } from '../supabase';
import { MarketNewsItem } from '../../types';

export const marketDb = {
  // Fetch market news sorted by date
  getNews: async (): Promise<MarketNewsItem[]> => {
    // Local storage key
    const LOCAL_KEY = 'sproutly_market_news';

    if (!supabase) {
        const saved = localStorage.getItem(LOCAL_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    try {
        const { data, error } = await supabase
            .from('market_news')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            // Expanded Error Handling for Missing Table / Schema Cache issues
            if (
                error.code === '42P01' || 
                error.message?.includes('market_news') || 
                error.message?.includes('schema cache') ||
                error.message?.includes('does not exist')
            ) { 
                console.warn("Market table missing or schema error, falling back to local storage.");
                const saved = localStorage.getItem(LOCAL_KEY);
                return saved ? JSON.parse(saved) : [];
            }
            throw error;
        }
        return data || [];
    } catch (e: any) {
        console.error("Market fetch error:", e.message || e);
        // Fallback to local storage on error to keep app functional
        const saved = localStorage.getItem(LOCAL_KEY);
        return saved ? JSON.parse(saved) : [];
    }
  },

  // Save new intelligence item
  addNews: async (item: MarketNewsItem): Promise<void> => {
    const LOCAL_KEY = 'sproutly_market_news';

    if (!supabase) {
        const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        localStorage.setItem(LOCAL_KEY, JSON.stringify([item, ...current]));
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const payload = { ...item, author_id: session?.user?.id };
        
        const { error } = await supabase.from('market_news').insert(payload);
        
        if (error) {
             if (
                error.code === '42P01' || 
                error.message?.includes('market_news') || 
                error.message?.includes('schema cache') ||
                error.message?.includes('does not exist')
            ) { 
                // Table missing fallback
                const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
                localStorage.setItem(LOCAL_KEY, JSON.stringify([item, ...current]));
                return;
            }
            throw error;
        }
    } catch (e: any) {
        console.error("Market save error:", e.message || e);
        // Fallback to local
        const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        localStorage.setItem(LOCAL_KEY, JSON.stringify([item, ...current]));
    }
  },

  // Delete item
  deleteNews: async (id: string): Promise<void> => {
      const LOCAL_KEY = 'sproutly_market_news';

      if (!supabase) {
          const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
          const filtered = current.filter((i: any) => i.id !== id);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));
          return;
      }

      try {
          const { error } = await supabase.from('market_news').delete().eq('id', id);
          if (error) throw error;
      } catch (e) {
          console.warn("Market delete error, syncing local");
          // Fallback local delete
          const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
          const filtered = current.filter((i: any) => i.id !== id);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));
      }
  }
};
