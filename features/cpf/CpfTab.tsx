import React, { useMemo } from 'react';
import { toNum, fmtSGD, monthNames } from '../../lib/helpers';
import { getCpfRates, CPF_WAGE_CEILING } from '../../lib/cpfRules';
import { computeCpf } from '../../lib/calculators';
import LabeledText from '../../components/common/LabeledText';
import LabeledSelect from '../../components/common/LabeledSelect';
import Card from '../../components/common/Card';
import LineChart from '../../components/common/LineChart';
import { CpfData, CpfState } from '../../types';

interface CpfTabProps {
  cpfData: CpfData | null;
  age: number;
  cpfState: CpfState;
  setCpfState: (s: CpfState) => void;
}

const CpfTab: React.FC<CpfTabProps> = ({ cpfData, age, cpfState, setCpfState }) => {
  // Destructure for easier access
  const { currentBalances, withdrawals } = cpfState;

  const updateBalance = (key: 'oa' | 'sa' | 'ma', val: string) => {
    setCpfState({
      ...cpfState,
      currentBalances: { ...currentBalances, [key]: val }
    });
  };

  const addWithdrawal = () => {
    setCpfState({
      ...cpfState,
      withdrawals: [...withdrawals, {
        id: Date.now(),
        purpose: '',
        account: 'oa',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'onetime',
        frequency: 'monthly'
      }]
    });
  };

  const removeWithdrawal = (id: number) => {
    setCpfState({
      ...cpfState,
      withdrawals: withdrawals.filter(w => w.id !== id)
    });
  };

  const updateWithdrawal = (id: number, field: string, value: any) => {
    setCpfState({
      ...cpfState,
      withdrawals: withdrawals.map(w => w.id === id ? { ...w, [field]: value } : w)
    });
  };

  // Calculate projected monthly balances
  const monthlyProjection = useMemo(() => {
    if (!cpfData) return null;
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const projectionMonths = Math.min(360, (85 - Math.round(age)) * 12); // Project up to age 85 or 30 years
    
    let oaBalance = toNum(currentBalances.oa, 0);
    let saBalance = toNum(currentBalances.sa, 0);
    let maBalance = toNum(currentBalances.ma, 0);
    
    const projection = [];
    const salaryBasis = cpfData.cpfableSalary; // Assuming salary doesn't grow but uses current ceiling basis
    
    for (let m = 0; m <= projectionMonths; m++) {
      const monthAge = age + (m / 12);
      const year = currentYear + Math.floor((currentMonth + m) / 12);
      const month = (currentMonth + m) % 12;
      
      let monthlyContribution = 0;

      // STEP 1: Add monthly contributions (if not first month)
      // DYNAMIC CALCULATION: Recalculate CPF based on current projected age
      if (m > 0) {
        // Use the original cpfableSalary as the basis (assuming constant salary for projection)
        // This ensures that as age increases (e.g. hitting 35, 45, 55), the allocation automatically shifts
        // correctly between OA, SA, and MA according to Singapore CPF rules.
        const dynamicCpf = computeCpf(salaryBasis, monthAge);
        
        oaBalance += dynamicCpf.oa;
        saBalance += dynamicCpf.sa;
        maBalance += dynamicCpf.ma;
        monthlyContribution = dynamicCpf.total;
      }
      
      // STEP 2: Apply interest FIRST (in January, for previous year's balance)
      const isInterestMonth = (month === 0 && m > 0);
      if (isInterestMonth) { 
        oaBalance *= 1.025;
        saBalance *= 1.04;
        maBalance *= 1.04;
      }
      
      // STEP 3: Apply withdrawals
      withdrawals.forEach(w => {
        const withdrawalDate = new Date(w.date);
        const withdrawalYear = withdrawalDate.getFullYear();
        const withdrawalMonth = withdrawalDate.getMonth();
        
        if (w.type === 'onetime') {
          if (year === withdrawalYear && month === withdrawalMonth) {
            const amount = toNum(w.amount, 0);
            if (w.account === 'oa') oaBalance = Math.max(0, oaBalance - amount);
            else if (w.account === 'sa') saBalance = Math.max(0, saBalance - amount);
            else if (w.account === 'ma') maBalance = Math.max(0, maBalance - amount);
          }
        } else if (w.type === 'recurring') {
          const monthsSinceWithdrawal = (year - withdrawalYear) * 12 + (month - withdrawalMonth);
          if (monthsSinceWithdrawal >= 0) {
            let shouldWithdraw = false;
            if (w.frequency === 'monthly') shouldWithdraw = true;
            else if (w.frequency === 'quarterly' && monthsSinceWithdrawal % 3 === 0) shouldWithdraw = true;
            else if (w.frequency === 'yearly' && monthsSinceWithdrawal % 12 === 0) shouldWithdraw = true;
            
            if (shouldWithdraw) {
              const amount = toNum(w.amount, 0);
              if (w.account === 'oa') oaBalance = Math.max(0, oaBalance - amount);
              else if (w.account === 'sa') saBalance = Math.max(0, saBalance - amount);
              else if (w.account === 'ma') maBalance = Math.max(0, maBalance - amount);
            }
          }
        }
      });
      
      const total = oaBalance + saBalance + maBalance;

      projection.push({
        month: m,
        age: Math.round(monthAge),
        ageDecimal: monthAge,
        year,
        monthLabel: monthNames[month],
        ageLabel: `Age ${Math.round(monthAge)}`,
        oa: oaBalance,
        sa: saBalance,
        ma: maBalance,
        total,
        monthlyContribution,
        isInterestMonth
      });
    }
    
    return projection;
  }, [cpfData, age, currentBalances, withdrawals]);
  
  if (!cpfData) {
    return (
      <div className="p-5">
        <Card title="⚠️ Profile Required" value="Please complete your profile information first" tone="warn" />
      </div>
    );
  }
  
  const cpfRates = getCpfRates(age);
  
  return (
    <div className="p-5">
      {/* Current Balances Input Section */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-xl p-6 mb-5 shadow-md">
        <h3 className="mt-0 text-blue-800 text-lg font-bold mb-2">
          💼 Your Current CPF Balances
        </h3>
        <p className="m-0 mb-5 text-blue-600 text-sm">
          Enter your current CPF account balances to see accurate projections
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <LabeledText
              label="🏠 Ordinary Account (OA)"
              value={currentBalances.oa}
              onChange={(val) => updateBalance('oa', val)}
              placeholder="e.g., 80000"
            />
            <div className="text-[11px] text-blue-600 mt-1">
              For housing, investments, education
            </div>
          </div>
          
          <div>
            <LabeledText
              label="🎯 Special Account (SA)"
              value={currentBalances.sa}
              onChange={(val) => updateBalance('sa', val)}
              placeholder="e.g., 40000"
            />
            <div className="text-[11px] text-blue-600 mt-1">
              For retirement only (4% interest)
            </div>
          </div>
          
          <div>
            <LabeledText
              label="🏥 MediSave (MA)"
              value={currentBalances.ma}
              onChange={(val) => updateBalance('ma', val)}
              placeholder="e.g., 30000"
            />
            <div className="text-[11px] text-blue-600 mt-1">
              For healthcare expenses (4% interest)
            </div>
          </div>
        </div>
        
        {/* Total Current Balance */}
        {(toNum(currentBalances.oa) + toNum(currentBalances.sa) + toNum(currentBalances.ma)) > 0 && (
          <div className="mt-4 p-4 bg-white rounded-lg border-2 border-blue-500">
            <div className="text-[13px] font-bold text-blue-800 mb-1">
              💰 Total Current CPF Balance
            </div>
            <div className="text-2xl font-bold text-blue-800">
              {fmtSGD(toNum(currentBalances.oa) + toNum(currentBalances.sa) + toNum(currentBalances.ma))}
            </div>
          </div>
        )}
      </div>
      
      {/* Monthly Contributions Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm mb-5">
        <h2 className="text-xl font-bold mb-5 text-gray-800">💵 Monthly CPF Contributions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Card 
            title={`Employee (${(cpfRates.employee * 100).toFixed(1)}%)`} 
            value={fmtSGD(cpfData.employee)} 
            tone="info" 
            icon="👤" 
          />
          <Card 
            title={`Employer (${(cpfRates.employer * 100).toFixed(1)}%)`} 
            value={fmtSGD(cpfData.employer)} 
            tone="success" 
            icon="🏢" 
          />
          <Card 
            title="Total Monthly CPF" 
            value={fmtSGD(cpfData.total)} 
            tone="info" 
            icon="💰" 
          />
        </div>

        {/* CPF Wage Ceiling Information */}
        <div className="mt-5 p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border-2 border-amber-400">
          <div className="text-[13px] font-bold text-amber-900 mb-2 flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            CPF Wage Ceiling Information
          </div>
          <div className="text-xs text-amber-900 leading-relaxed space-y-1.5">
            <div>
              • CPF contributions are capped at <strong>SGD {fmtSGD(CPF_WAGE_CEILING).replace('SGD $', '$')}</strong>/month (2025 Ordinary Wage ceiling)
            </div>
            <div className="italic text-amber-800/80">
              Note: Ceiling increases to SGD 8,000/month from Jan 2026
            </div>
            {cpfData.excessSalary > 0 && (
              <>
                <div>
                  • Your CPFable salary: <strong>{fmtSGD(cpfData.cpfableSalary)}</strong>
                </div>
                <div>
                  • Salary above ceiling: <strong>{fmtSGD(cpfData.excessSalary)}</strong> (no CPF deducted on this amount)
                </div>
              </>
            )}
            {cpfData.excessSalary === 0 && (
              <div>
                • Your entire gross salary of <strong>{fmtSGD(cpfData.cpfableSalary)}</strong> is subject to CPF contributions
              </div>
            )}
            <div>
              • For salaries above ceiling, consider voluntary SRS or other retirement savings options
            </div>
          </div>
        </div>

        <h3 className="text-lg font-bold mb-4 mt-6 text-gray-800">📊 Monthly Account Allocation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
            <div className="text-xs font-bold text-blue-800 mb-2">Ordinary Account (OA)</div>
            <div className="text-xl font-bold text-blue-800">{fmtSGD(cpfData.oa)}</div>
            <div className="text-[10px] text-blue-600 mt-1">per month</div>
          </div>
          <div className="border-2 border-emerald-500 rounded-lg p-4 bg-emerald-50">
            <div className="text-xs font-bold text-emerald-800 mb-2">Special Account (SA)</div>
            <div className="text-xl font-bold text-emerald-800">{fmtSGD(cpfData.sa)}</div>
            <div className="text-[10px] text-emerald-600 mt-1">per month</div>
          </div>
          <div className="border-2 border-amber-500 rounded-lg p-4 bg-amber-50">
            <div className="text-xs font-bold text-amber-800 mb-2">MediSave (MA)</div>
            <div className="text-xl font-bold text-amber-800">{fmtSGD(cpfData.ma)}</div>
            <div className="text-[10px] text-amber-600 mt-1">per month</div>
          </div>
        </div>
      </div>
      
      {/* CPF Withdrawals/Usage Section */}
      <div className="bg-white border-2 border-amber-500 rounded-xl p-6 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="m-0 text-amber-800 text-lg font-bold">
              🏠 CPF Withdrawals & Usage
            </h3>
            <p className="m-1 text-amber-500 text-[13px]">
              Track housing loans, investments, education expenses, etc.
            </p>
          </div>
          <button
            onClick={addWithdrawal}
            className="px-5 py-2.5 bg-gradient-to-br from-amber-400 to-amber-600 text-white border-none rounded-lg text-sm font-bold shadow-md cursor-pointer hover:from-amber-500 hover:to-amber-700"
          >
            + Add Withdrawal
          </button>
        </div>
        
        {withdrawals.length === 0 ? (
          <div className="p-5 bg-amber-50 rounded-lg text-center text-amber-800">
            No withdrawals tracked yet. Click "Add Withdrawal" to record housing loans, investments, etc.
          </div>
        ) : (
          <div className="grid gap-3">
            {withdrawals.map(w => (
              <div key={w.id} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
                  <LabeledText
                    label="Purpose"
                    value={w.purpose}
                    onChange={(val) => updateWithdrawal(w.id, 'purpose', val)}
                    placeholder="e.g., Housing loan"
                  />
                  
                  <LabeledSelect
                    label="From Account"
                    value={w.account}
                    onChange={(val) => updateWithdrawal(w.id, 'account', val)}
                    options={[
                      { label: '🏠 Ordinary (OA)', value: 'oa' },
                      { label: '🎯 Special (SA)', value: 'sa' },
                      { label: '🏥 MediSave (MA)', value: 'ma' }
                    ]}
                  />
                  
                  <LabeledText
                    label="Amount"
                    value={w.amount}
                    onChange={(val) => updateWithdrawal(w.id, 'amount', val)}
                    placeholder="50000"
                  />
                  
                  <LabeledText
                    label="Date"
                    type="date"
                    value={w.date}
                    onChange={(val) => updateWithdrawal(w.id, 'date', val)}
                  />
                  
                  <LabeledSelect
                    label="Type"
                    value={w.type}
                    onChange={(val) => updateWithdrawal(w.id, 'type', val)}
                    options={[
                      { label: 'One-time', value: 'onetime' },
                      { label: 'Recurring', value: 'recurring' }
                    ]}
                  />
                  
                  {w.type === 'recurring' && (
                    <LabeledSelect
                      label="Frequency"
                      value={w.frequency}
                      onChange={(val) => updateWithdrawal(w.id, 'frequency', val)}
                      options={[
                        { label: 'Monthly', value: 'monthly' },
                        { label: 'Quarterly', value: 'quarterly' },
                        { label: 'Yearly', value: 'yearly' }
                      ]}
                    />
                  )}
                </div>
                
                <button
                  onClick={() => removeWithdrawal(w.id)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-md text-xs font-semibold hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Monthly Account Balance Projection */}
      {monthlyProjection && monthlyProjection.length > 0 && (
        <div className="bg-white rounded-xl p-6 mb-5 shadow-md">
          <h3 className="mt-0 text-gray-800 text-lg font-bold mb-4">
            📈 CPF Account Balance Projection
          </h3>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Card
              title="Current Total CPF"
              value={fmtSGD(monthlyProjection[0].total)}
              tone="info"
              icon="💰"
            />
            <Card
              title={`Projected at Age ${Math.round(monthlyProjection[monthlyProjection.length - 1].age)}`}
              value={fmtSGD(monthlyProjection[monthlyProjection.length - 1].total)}
              tone="success"
              icon="🎯"
            />
            <Card
              title="Total Growth"
              value={fmtSGD(monthlyProjection[monthlyProjection.length - 1].total - monthlyProjection[0].total)}
              tone="success"
              icon="📈"
            />
          </div>
          
          {/* Chart */}
          <LineChart
            xLabels={monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ageLabel)}
            series={[
              { name: 'OA Balance', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.oa), stroke: '#3b82f6' },
              { name: 'SA Balance', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.sa), stroke: '#10b981' },
              { name: 'MA Balance', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.ma), stroke: '#f59e0b' },
              { name: 'Total CPF', values: monthlyProjection.filter((_, i) => i % 12 === 0).map(d => d.total), stroke: '#8b5cf6' }
            ]}
            height={300}
            onFormatY={(val) => {
              if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
              if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
              return fmtSGD(val);
            }}
          />

          {/* Monthly Breakdown Table */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="m-0 text-gray-800 text-base font-bold">
                📋 Monthly CPF Account Breakdown
              </h4>
              <div className="text-xs text-gray-500">
                Showing all months from age {Math.round(monthlyProjection[0].age)} to {Math.round(monthlyProjection[monthlyProjection.length - 1].age)}
              </div>
            </div>
            
            {/* Table Container */}
            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[600px] overflow-y-auto">
              <table className="w-full border-collapse text-[13px] min-w-[1000px]">
                <thead className="sticky top-0 bg-gradient-to-br from-gray-100 to-gray-200 z-10">
                  <tr>
                    <th className="p-3 text-left font-bold border-b-2 border-gray-300 text-gray-700 sticky left-0 bg-gray-100 z-20">Date</th>
                    <th className="p-3 text-left font-bold border-b-2 border-gray-300 text-gray-700">Age</th>
                    <th className="p-3 text-right font-bold border-b-2 border-gray-300 text-blue-800">OA Balance</th>
                    <th className="p-3 text-right font-bold border-b-2 border-gray-300 text-emerald-800">SA Balance</th>
                    <th className="p-3 text-right font-bold border-b-2 border-gray-300 text-amber-800">MA Balance</th>
                    <th className="p-3 text-right font-bold border-b-2 border-gray-300 text-indigo-800">Total CPF</th>
                    <th className="p-3 text-right font-bold border-b-2 border-gray-300 text-teal-700">Monthly Change</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyProjection.map((row, idx) => {
                    const prevTotal = idx > 0 ? monthlyProjection[idx - 1].total : row.total;
                    const monthlyChange = row.total - prevTotal;
                    const isYearEnd = row.monthLabel === 'Dec';
                    const isInterestMonth = row.isInterestMonth; // January
                    
                    const rowBg = isInterestMonth ? 'bg-emerald-50' : (isYearEnd ? 'bg-blue-50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'));
                    const borderClass = isYearEnd ? 'border-b-2 border-blue-500' : (isInterestMonth ? 'border-b-2 border-emerald-500' : 'border-b border-gray-100');

                    return (
                      <tr key={idx} className={`${rowBg} ${borderClass}`}>
                        <td className={`p-3 font-medium sticky left-0 border-r border-gray-200 ${rowBg} ${isInterestMonth ? 'text-emerald-800 font-bold' : 'text-gray-700'}`}>
                          {isInterestMonth && '💰 '}{row.year}-{row.monthLabel}
                        </td>
                        <td className="p-3 text-gray-500">
                          {row.age}
                        </td>
                        <td className="p-3 text-right font-semibold text-blue-800">
                          {fmtSGD(row.oa)}
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-800">
                          {fmtSGD(row.sa)}
                        </td>
                        <td className="p-3 text-right font-semibold text-amber-800">
                          {fmtSGD(row.ma)}
                        </td>
                        <td className="p-3 text-right font-bold text-indigo-800 text-sm">
                          {fmtSGD(row.total)}
                        </td>
                        <td className={`p-3 text-right font-bold ${monthlyChange >= 0 ? (isInterestMonth ? 'text-teal-600' : 'text-emerald-600') : 'text-red-600'}`}>
                          {isInterestMonth && '✨ '}{monthlyChange >= 0 ? '+' : ''}{fmtSGD(monthlyChange)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Table Legend/Info */}
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
              <div className="font-bold mb-1 text-gray-700">💡 Table Information:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <div>• <span className="text-blue-600 font-bold">Blue rows</span> = December (Year-end)</div>
                <div>• <span className="text-emerald-600 font-bold">Green rows with 💰</span> = January (Interest credited)</div>
                <div>• Monthly contributions added automatically</div>
                <div>• Interest applied in January (2.5% OA, 4% SA/MA)</div>
                <div>• Withdrawals deducted when scheduled</div>
                <div>• <span className="font-bold">Monthly Change</span> = Total change from previous month</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CpfTab;