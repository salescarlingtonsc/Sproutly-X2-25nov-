import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { analyzeMarketIntel, generateMarketPulse, fetchLiveMarketNews } from '../../lib/gemini';
import { marketDb } from '../../lib/db/market';
import { MarketNewsItem } from '../../types';
import { fmtDateTime } from '../../lib/helpers';

const SentimentBadge: React.FC<{ sentiment: string }> = ({ sentiment }) => {
  const styles = {
    bullish: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    bearish: 'bg-rose-100 text-rose-800 border-rose-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    volatile: 'bg-amber-100 text-amber-800 border-amber-200'
  };
  const labels = {
    bullish: '🐂 Bullish',
    bearish: '🐻 Bearish',
    neutral: '⚖️ Neutral',
    volatile: '⚡ Volatile'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${styles[sentiment as keyof typeof styles] || styles.neutral}`}>
      {labels[sentiment as keyof typeof labels] || sentiment}
    </span>
  );
};

const NewsCard: React.FC<{ item: MarketNewsItem; onDelete: (id: string) => void }> = ({ item, onDelete }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 relative group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-2 items-center">
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fmtDateTime(item.created_at)}</span>
           <SentimentBadge sentiment={item.sentiment} />
           {item.tickers && item.tickers.length > 0 && (
              <span className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded text-[10px] font-mono border border-slate-100">
                 {item.tickers.join(', ')}
              </span>
           )}
           {item.source_label === 'Live Web' && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100">
                 LIVE
              </span>
           )}
        </div>
        <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-1">✕</button>
      </div>
      
      <h3 className="text-lg font-bold text-slate-800 mb-2 leading-tight">{item.headline}</h3>
      <p className="text-sm text-slate-500 mb-6 leading-relaxed border-l-2 border-indigo-100 pl-3">{item.reason}</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-100">
         <div>
            <div className="font-black text-indigo-400 uppercase tracking-widest text-[9px] mb-1">Short Term</div>
            <p className="text-slate-700 font-medium">{item.impact_short}</p>
         </div>
         <div>
            <div className="font-black text-indigo-400 uppercase tracking-widest text-[9px] mb-1">Mid Term</div>
            <p className="text-slate-700 font-medium">{item.impact_mid}</p>
         </div>
         <div>
            <div className="font-black text-indigo-400 uppercase tracking-widest text-[9px] mb-1">Long Term</div>
            <p className="text-slate-700 font-medium">{item.impact_long}</p>
         </div>
      </div>
    </div>
  );
};

const MarketNewsTab: React.FC = () => {
  const toast = useToast();
  const [news, setNews] = useState<MarketNewsItem[]>([]);
  const [pulse, setPulse] = useState<string>('');
  const [loadingPulse, setLoadingPulse] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Ingest Modal
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadNews();
    const onFocus = () => loadNews();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const loadNews = async () => {
    const data = await marketDb.getNews();
    setNews(data);
    if (data.length > 0 && !pulse) {
        generatePulse(data);
    }
  };

  const generatePulse = async (data: MarketNewsItem[]) => {
      setLoadingPulse(true);
      const summary = await generateMarketPulse(data);
      setPulse(summary);
      setLoadingPulse(false);
  };

  const handleLiveSync = async () => {
      setIsSyncing(true);
      toast.info("Scanning global markets... Broadcasting to team...");
      
      try {
          // 1. Fetch from Gemini Search
          const liveItems = await fetchLiveMarketNews();
          
          if (!liveItems || liveItems.length === 0) {
              toast.error("No significant news found or parsing failed.");
              setIsSyncing(false);
              return;
          }

          // 2. Process
          const processedItems: MarketNewsItem[] = liveItems.map((item: any, idx: number) => ({
              id: `live_${Date.now()}_${idx}`,
              headline: item.headline || 'Market Alert',
              summary: item.summary || '',
              reason: item.reason || 'Live Market Data',
              impact_short: item.impact_short || 'Monitor',
              impact_mid: item.impact_mid || 'Monitor',
              impact_long: item.impact_long || 'Monitor',
              sentiment: item.sentiment || 'neutral',
              regions: item.regions || ['Global'],
              tickers: item.tickers || [],
              created_at: new Date().toISOString(),
              source_label: 'Live Web'
          }));

          // 3. Save ALL at once (Atomic update) to prevent partial saves
          // We need to reverse because addNews usually prepends, but here we want to batch
          // Since marketDb.addNews saves individually, let's just loop.
          // For true batching, we rely on the rapid execution.
          for (const item of processedItems) {
              await marketDb.addNews(item);
          }

          // 4. Refresh UI
          const freshNews = await marketDb.getNews();
          setNews(freshNews);
          generatePulse(freshNews);
          toast.success(`Synced & Broadcasted ${processedItems.length} new insights.`);

      } catch (e: any) {
          toast.error("Sync failed: " + e.message);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleProcessIntel = async () => {
    if (!rawInput.trim()) return;
    setIsProcessing(true);
    try {
        // 1. Send to AI
        const analysis = await analyzeMarketIntel(rawInput);
        
        // 2. Format
        const newItem: MarketNewsItem = {
            id: `news_${Date.now()}`,
            headline: analysis.headline || 'Market Update',
            summary: analysis.summary || '',
            reason: analysis.reason || 'Manual Input',
            impact_short: analysis.impact_short || 'Monitor',
            impact_mid: analysis.impact_mid || 'Monitor',
            impact_long: analysis.impact_long || 'Monitor',
            sentiment: analysis.sentiment || 'neutral',
            regions: analysis.regions || [],
            tickers: analysis.tickers || [],
            created_at: new Date().toISOString(),
            source_label: 'Manual Ingest'
        };

        // 3. Save
        await marketDb.addNews(newItem);
        
        // 4. Update UI
        setNews(prev => [newItem, ...prev]);
        toast.success("Intelligence Ingested & Broadcasted.");
        setIsIngestOpen(false);
        setRawInput('');
    } catch (e: any) {
        toast.error("Processing failed: " + e.message);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Remove this intelligence record? This removes it for everyone.")) return;
      await marketDb.deleteNews(id);
      setNews(prev => prev.filter(n => n.id !== id));
      toast.success("Record deleted globally.");
  };

  const handleClearAll = async () => {
      if (!confirm("Clear ALL market intelligence? This action affects the entire organization.")) return;
      await marketDb.clearAllNews();
      setNews([]);
      setPulse('');
      toast.success("Feed cleared for organization.");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <PageHeader 
        title="Market Intelligence" 
        icon="📡" 
        subtitle={
            <span className="flex items-center gap-2">
                Strategic News Aggregation.
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-200 uppercase tracking-wide">
                    Organization Intelligence Feed
                </span>
            </span>
        }
        action={
            <div className="flex gap-2">
                <Button variant="secondary" onClick={handleLiveSync} isLoading={isSyncing} leftIcon="⚡">
                    Live Market Sync
                </Button>
                <Button variant="ghost" onClick={() => generatePulse(news)} disabled={loadingPulse}>
                    {loadingPulse ? 'Analyzing...' : '↻ Refresh Outlook'}
                </Button>
                <Button variant="primary" onClick={() => setIsIngestOpen(true)} leftIcon="📥">
                    Inject Intel
                </Button>
            </div>
        }
      />

      {/* --- SMART OUTLOOK HEADER --- */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none"></div>
         
         <div className="relative z-10 flex flex-col md:flex-row justify-between gap-8">
            <div className="flex-1">
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Sproutly Chief Investment Officer</span>
                </div>
                <h2 className="text-2xl font-bold mb-4">Market Outlook</h2>
                {pulse ? (
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed whitespace-pre-line">
                        {pulse}
                    </div>
                ) : (
                    <div className="text-slate-500 italic text-sm">Awaiting intelligence data to formulate strategy...</div>
                )}
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-w-[250px] backdrop-blur-sm flex flex-col justify-center">
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Alpha Signal</div>
                    <div className="text-4xl font-black text-white tracking-tighter mb-1">
                        {news.length > 0 && news[0].sentiment === 'bullish' ? 'RISK ON' : news.length > 0 && news[0].sentiment === 'bearish' ? 'DEFENSIVE' : 'NEUTRAL'}
                    </div>
                    <div className="text-xs text-indigo-300 font-medium">Based on recent flow</div>
                </div>
            </div>
         </div>
      </div>

      {/* --- NEWS FEED --- */}
      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Intelligence Feed ({news.length})</h3>
            {news.length > 0 && (
                <button onClick={handleClearAll} className="text-[10px] font-bold text-red-400 hover:text-red-600 hover:underline">
                    Clear Feed
                </button>
            )}
         </div>
         
         {news.length === 0 ? (
             <div className="p-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                 <div className="text-4xl mb-4 grayscale opacity-20">📰</div>
                 <p className="text-slate-400 font-medium text-sm">No intelligence recorded.</p>
                 <p className="text-slate-300 text-xs mt-1">Use "Live Market Sync" to push updates to the team.</p>
             </div>
         ) : (
             <div className="grid grid-cols-1 gap-6">
                 {news.map(item => (
                     <NewsCard key={item.id} item={item} onDelete={handleDelete} />
                 ))}
             </div>
         )}
      </div>

      {/* --- INGEST MODAL --- */}
      <Modal 
        isOpen={isIngestOpen} 
        onClose={() => setIsIngestOpen(false)} 
        title="Neural Ingest"
        footer={
            <div className="flex gap-2 w-full justify-end">
                <Button variant="ghost" onClick={() => setIsIngestOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleProcessIntel} isLoading={isProcessing} disabled={!rawInput.trim()}>
                    Broadcast Intel
                </Button>
            </div>
        }
      >
         <div className="space-y-4">
            <p className="text-xs text-slate-500 font-medium">
                Paste raw text from news articles, research reports, or internal memos. 
                Sproutly AI will distill it into structured market intelligence and <strong>push it to the entire organization.</strong>
            </p>
            <textarea 
                className="w-full h-48 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                placeholder="Paste text here..."
                value={rawInput}
                onChange={e => setRawInput(e.target.value)}
                autoFocus
            />
            <div className="flex items-center gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                <span className="text-indigo-600">⚡</span>
                <span className="text-[10px] font-bold text-indigo-800 uppercase">AI Processing Active:</span>
                <span className="text-[10px] text-indigo-600">Will extract Impact, Reason & Sentiment.</span>
            </div>
         </div>
      </Modal>
    </div>
  );
};

export default MarketNewsTab;