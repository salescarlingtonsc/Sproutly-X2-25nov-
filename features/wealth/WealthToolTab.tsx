import React, { useMemo } from 'react';
import { toNum, fmtSGD } from '../../lib/helpers';
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

  const updateState = (key: keyof WealthState, value: any) => {
    setWealthState({ ...wealthState, [key]: value });
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
      // Simple compound calculation for demo purposes (matching previous complexity roughly)
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
        <h2 className="text-xl font-bold mb-4 text-gray-800">💎 Wealth Tool - ILP Projection</h2>
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