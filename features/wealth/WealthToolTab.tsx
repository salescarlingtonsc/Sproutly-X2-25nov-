
import React, { useMemo, useState } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
import { getMarketRealityCheck } from '../../lib/gemini';
import LabeledText from '../../components/common/LabeledText';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { WealthState } from '../../types';

interface WealthToolTabProps {
  wealthState: WealthState;
  setWealthState: (s: WealthState) => void;
}

const WealthToolTab: React.FC<WealthToolTabProps> = ({ wealthState, setWealthState }) => {
  const { annualPremium, projectionYears, growthRate } = wealthState;
  const [realityCheck, setRealityCheck] = useState<{text: string, sources: any[]} | null>(null);
  const [loadingReality, setLoadingReality] = useState(false);

  const updateState = (key: keyof WealthState, value: any) => {
    setWealthState({ ...wealthState, [key]: value });
  };

  const handleRealityCheck = async () => {
    setLoadingReality(true);
    try {
      const result = await getMarketRealityCheck(`What is the 5-year and 10-year annualized return of the S&P 500 and Straits Times Index (STI) as of today?`);
      setRealityCheck(result);
    } catch (e) {
      alert("Grounding service unavailable.");
    } finally {
      setLoadingReality(false);
    }
  };

  const ilpProjection = useMemo(() => {
    const premium = toNum(annualPremium);
    if (!premium || premium <= 0) return null;

    const years = toNum(projectionYears, 20);
    const rate = toNum(growthRate, 5) / 100;
    const projection = [];
    let cumulativeInvested = 0;
    let portfolioValue = 0;

    for (let year = 1; year <= years; year++) {
      cumulativeInvested += premium;
      portfolioValue = (portfolioValue + premium) * (1 + rate);

      projection.push({
        year,
        cumulativeInvested,
        portfolioValue,
        gain: portfolioValue - cumulativeInvested
      });
    }

    return { projection };
  }, [annualPremium, projectionYears, growthRate]);

  return (
    <div className="p-5">
      <div className="bg-white rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-xl font-bold text-gray-800">💎 Wealth Tool - Projection</h2>
           <button 
             onClick={handleRealityCheck}
             disabled={loadingReality}
             className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 border border-blue-200 flex items-center gap-2"
           >
             {loadingReality ? 'Searching Google...' : '🌍 Verify Market Rates'}
           </button>
        </div>

        {/* Reality Check Result */}
        {realityCheck && (
          <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
             <div className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="text-lg">google</span> Live Market Context:
             </div>
             <div className="text-slate-700 mb-3">{realityCheck.text}</div>
             <div className="flex flex-wrap gap-2">
                {realityCheck.sources?.map((chunk: any, i: number) => (
                   chunk.web?.uri && (
                     <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-white border px-2 py-1 rounded text-blue-600 hover:underline truncate max-w-[200px]">
                        🔗 {chunk.web.title}
                     </a>
                   )
                ))}
             </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <LabeledText label="Annual Premium (SGD)" value={annualPremium} onChange={(v) => updateState('annualPremium', v)} type="number" placeholder="24000" />
            <LabeledText label="Projection Years" value={projectionYears} onChange={(v) => updateState('projectionYears', v)} type="number" placeholder="20" />
            <LabeledText label="Expected Growth Rate (%)" value={growthRate} onChange={(v) => updateState('growthRate', v)} type="number" placeholder="5" />
          </div>
        </div>

        {ilpProjection && (
          <>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <Card title="Total Invested" value={fmtSGD(ilpProjection.projection[ilpProjection.projection.length - 1].cumulativeInvested)} tone="info" icon="💰" />
              <Card title="Total Portfolio" value={fmtSGD(ilpProjection.projection[ilpProjection.projection.length - 1].portfolioValue)} tone="success" icon="📈" />
            </div>
            <div className="mb-6">
              <LineChart
                xLabels={ilpProjection.projection.map(p => `Year ${p.year}`)}
                series={[
                  { name: 'Total Portfolio', values: ilpProjection.projection.map(p => p.portfolioValue), stroke: '#3B82F6' },
                  { name: 'Total Invested', values: ilpProjection.projection.map(p => p.cumulativeInvested), stroke: '#6B7280' }
                ]}
                height={300}
                onFormatY={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WealthToolTab;
