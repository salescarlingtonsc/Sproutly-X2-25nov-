
import { adminDb } from './admin';
import { MarketNewsItem } from '../../types';

// Fallback Key
const LOCAL_KEY = 'sproutly_market_news';

export const marketDb = {
  // Fetch market news sorted by date
  // NOW SHARED: Reads from Organization Settings
  getNews: async (): Promise<MarketNewsItem[]> => {
    try {
        const settings = await adminDb.getSystemSettings();
        if (settings?.marketIntel) {
            return settings.marketIntel.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        
        // Fallback to local if no shared settings found (offline or uninitialized)
        const saved = localStorage.getItem(LOCAL_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.warn("Market fetch error, using local:", e);
        const saved = localStorage.getItem(LOCAL_KEY);
        return saved ? JSON.parse(saved) : [];
    }
  },

  // Save new intelligence item
  // NOW SHARED: Pushes to Organization Settings
  addNews: async (item: MarketNewsItem): Promise<void> => {
    try {
        const settings = await adminDb.getSystemSettings();
        
        // Default structure if empty
        const safeSettings = settings || {
            products: [],
            teams: [],
            appSettings: { statuses: [], platforms: [] },
            marketIntel: []
        };

        const currentNews = safeSettings.marketIntel || [];
        
        // Prepend new item and Limit to 50 items to keep JSON light
        const updatedNews = [item, ...currentNews].slice(0, 50);
        
        // Save back to DB
        await adminDb.saveSystemSettings({
            ...safeSettings,
            marketIntel: updatedNews
        });

        // Also sync local just in case
        localStorage.setItem(LOCAL_KEY, JSON.stringify(updatedNews));

    } catch (e: any) {
        console.error("Market save error (Permissions?):", e.message);
        // Fallback to local if DB write fails (e.g. Viewer role)
        const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        const updated = [item, ...current];
        localStorage.setItem(LOCAL_KEY, JSON.stringify(updated));
        
        // If it was a permission error, we rethrow so the UI can warn the user
        if (e.message?.includes('permission') || e.message?.includes('policy')) {
            throw new Error("Shared Database Write Failed (Permission Denied). Saved locally only.");
        }
    }
  },

  // Delete item
  deleteNews: async (id: string): Promise<void> => {
      try {
          const settings = await adminDb.getSystemSettings();
          if (!settings?.marketIntel) return;
          
          const updatedNews = settings.marketIntel.filter(i => i.id !== id);
          
          await adminDb.saveSystemSettings({
              ...settings,
              marketIntel: updatedNews
          });
          
          // Sync local
          localStorage.setItem(LOCAL_KEY, JSON.stringify(updatedNews));

      } catch (e) {
          console.warn("Market delete error, syncing local");
          const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
          const filtered = current.filter((i: any) => i.id !== id);
          localStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));
      }
  },
  
  // New: Clear All
  clearAllNews: async (): Promise<void> => {
      try {
          const settings = await adminDb.getSystemSettings();
          if (!settings) return;
          
          await adminDb.saveSystemSettings({
              ...settings,
              marketIntel: []
          });
          localStorage.removeItem(LOCAL_KEY);
      } catch (e) {
          localStorage.removeItem(LOCAL_KEY);
      }
  }
};
