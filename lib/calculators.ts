
import { toNum, monthsSinceDob, parseDob } from './helpers';
import { CPF_WAGE_CEILING, getCpfRates, getCpfAllocation } from './cpfRules';
import { CpfData, Child, EducationSettings, Profile, CashflowData } from '../types';

export const computeCpf = (grossSalary: any, age: number): CpfData => {
  // Apply CPF wage ceiling - CPF is only calculated on first SGD 7,400 (2025)
  const gross = toNum(grossSalary, 0);
  const cpfableSalary = Math.min(gross, CPF_WAGE_CEILING);
  
  const rates = getCpfRates(age);
  const allocation = getCpfAllocation(age);
  
  const employeeContrib = cpfableSalary * rates.employee;
  const employerContrib = cpfableSalary * rates.employer;
  const totalContrib = employeeContrib + employerContrib;
  
  return {
    employee: employeeContrib,
    employer: employerContrib,
    total: totalContrib,
    oa: totalContrib * allocation.oa,
    sa: totalContrib * allocation.sa,
    ma: totalContrib * allocation.ma,
    takeHome: gross - employeeContrib, // Take-home based on actual salary
    cpfableSalary: cpfableSalary, // The salary amount CPF was calculated on
    excessSalary: Math.max(0, gross - CPF_WAGE_CEILING) // Amount above ceiling
  };
};

/**
 * REVERSE CALCULATION ENGINE
 * Estimates Gross Salary from Net (Take-Home) Pay
 */
export const reverseComputeCpf = (takeHome: any, age: number): number => {
  const net = toNum(takeHome, 0);
  const rates = getCpfRates(age);
  
  // The threshold where the wage ceiling kicks in for the employee
  // For a 20% contributor, this is 7400 * (1 - 0.20) = 5920
  const netCeilingThreshold = CPF_WAGE_CEILING * (1 - rates.employee);
  
  if (net <= netCeilingThreshold) {
    // Below ceiling: Linear reverse
    return net / (1 - rates.employee);
  } else {
    // Above ceiling: Add the fixed max contribution back to the net
    const maxEmployeeContrib = CPF_WAGE_CEILING * rates.employee;
    return net + maxEmployeeContrib;
  }
};

export const computeRetirementProjection = (initialAmount: number, monthlyContribution: number, annualReturn: number, yearsToProject: number) => {
  const monthlyRate = annualReturn / 12;
  const months = yearsToProject * 12;
  const projection = [];
  
  let balance = initialAmount;
  let totalContributions = initialAmount;
  
  for (let m = 0; m <= months; m++) {
    if (m > 0) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      totalContributions += monthlyContribution;
    }
    
    if (m % 12 === 0) {
      projection.push({
        year: m / 12,
        balance: Math.round(balance),
        contributions: Math.round(totalContributions),
        gains: Math.round(balance - totalContributions)
      });
    }
  }
  
  return projection;
};

// --- COMPREHENSIVE WEALTH PROJECTION ---
export interface WealthProjectionInputs {
  currentAge: number;
  retirementAge: number;
  currentCpf: { oa: number, sa: number, ma: number };
  currentCash: number;
  currentInvestments: number;
  monthlyIncome: number; // Gross for CPF calc
  monthlyCashSavings: number; // Total potential savings
  monthlyInvestment: number; // Part of savings going to investments
  rates: {
    cpfOa: number; // usually 0.025
    cpfSa: number; // usually 0.04
    cash: number; // usually 0.005
    investments: number; // user defined
    inflation: number; // usually 0.03
  };
  expensesToday: number;
}

export const projectComprehensiveWealth = (inputs: WealthProjectionInputs) => {
  const { currentAge, retirementAge, currentCpf, currentCash, currentInvestments, monthlyIncome, monthlyCashSavings, monthlyInvestment, rates, expensesToday } = inputs;
  
  // Project until age 95 to be safe
  const yearsToProject = 95 - currentAge; 
  const projection = [];

  let cpfOa = currentCpf.oa;
  let cpfSa = currentCpf.sa;
  let cpfMa = currentCpf.ma;
  let cpfRa = 0; // Retirement Account, created at 55
  
  let cash = currentCash;
  let investments = currentInvestments;

  let cpfLifePayoutMonthly = 0;
  let hasRetired = false;

  // CONSTANTS (2025 Baseline)
  const CURRENT_FRS = 205800; // Full Retirement Sum 2025
  const FRS_INFLATION = 0.035; // FRS grows ~3.5% annually for projection of the standard
  
  // CPF Life Standard Plan Estimator
  // Based on ~$1,700 payout for $205,800 RA in 2025.
  const PAYOUT_RATIO = 1700 / 205800; 
  
  for (let y = 0; y <= yearsToProject; y++) {
    const age = currentAge + y;
    
    // Retirement Flag
    if (age >= retirementAge) {
      hasRetired = true;
    }

    // --- 1. GROWTH (Start of Year Balance Growth) ---
    cpfOa *= (1 + rates.cpfOa);
    cpfSa *= (1 + rates.cpfSa);
    cpfMa *= (1 + rates.cpfSa); // MA grows same as SA (4%)
    cpfRa *= 1.04; // RA grows at 4%
    
    cash *= (1 + rates.cash);
    investments *= (1 + rates.investments);

    // --- 2. CONTRIBUTIONS (If working) ---
    if (!hasRetired) {
      // CPF Contributions
      const cpfData = computeCpf(monthlyIncome, age);
      cpfOa += cpfData.oa * 12;
      cpfSa += cpfData.sa * 12;
      cpfMa += cpfData.ma * 12;

      // Cash & Investments
      const actualCashSavings = Math.max(0, monthlyCashSavings - monthlyInvestment);
      cash += actualCashSavings * 12;
      investments += monthlyInvestment * 12;
    }

    // --- 3. KEY EVENTS ---
    
    // EVENT: AGE 55 (Creation of Retirement Account)
    if (Math.floor(age) === 55 && cpfRa === 0) {
      // Projected FRS at Age 55
      const yearsTo55 = 55 - currentAge;
      const projectedFRS = yearsTo55 > 0 
        ? CURRENT_FRS * Math.pow(1 + FRS_INFLATION, yearsTo55)
        : CURRENT_FRS; 

      // Transfer logic: SA -> RA, then OA -> RA
      let transferAmount = 0;
      
      // Take from SA
      const takeFromSa = Math.min(cpfSa, projectedFRS);
      cpfSa -= takeFromSa;
      cpfRa += takeFromSa;
      transferAmount += takeFromSa;

      // Take from OA if SA wasn't enough
      if (transferAmount < projectedFRS) {
        const needed = projectedFRS - transferAmount;
        const takeFromOa = Math.min(cpfOa, needed);
        cpfOa -= takeFromOa;
        cpfRa += takeFromOa;
      }
      
      // Note: We don't simulate the 5k withdrawal here automatically, 
      // but the UI can show it's available.
    }

    // EVENT: AGE 65 (CPF LIFE START)
    if (Math.floor(age) === 65 && cpfLifePayoutMonthly === 0) {
      // Standard Plan Calculation
      // Payout is determined by RA sum.
      cpfLifePayoutMonthly = cpfRa * PAYOUT_RATIO;
      
      // In CPF Life, the RA premium is deducted to buy the annuity.
      // We zero out RA to represent it moving to the Annuity Pool.
      cpfRa = 0; 
    }

    // --- 4. DECUMULATION (Living Expenses) ---
    let expensesAnnual = 0;
    let shortfallAnnual = 0;

    if (hasRetired) {
      // Inflate expenses from "Today's Dollars"
      expensesAnnual = (expensesToday * 12) * Math.pow(1 + rates.inflation, y);
      
      // 1. Use CPF Life
      const cpfLifeAnnual = cpfLifePayoutMonthly * 12;
      let remainingNeed = Math.max(0, expensesAnnual - cpfLifeAnnual);

      // 2. Use Cash
      if (cash >= remainingNeed) {
        cash -= remainingNeed;
        remainingNeed = 0;
      } else {
        remainingNeed -= cash;
        cash = 0;
      }

      // 3. Use Investments
      if (remainingNeed > 0) {
        if (investments >= remainingNeed) {
          investments -= remainingNeed;
          remainingNeed = 0;
        } else {
          remainingNeed -= investments;
          investments = 0;
        }
      }
      
      shortfallAnnual = remainingNeed;
    }

    projection.push({
      age: Math.floor(age),
      year: y,
      cpfLiquid: cpfOa + cpfSa,
      cpfTotal: cpfOa + cpfSa + cpfMa + cpfRa, 
      cpfRa,
      cash,
      investments,
      totalLiquidWealth: (cpfOa + cpfSa) + cash + investments, // Useful for withdrawal
      totalNetWorth: (cpfOa + cpfSa + cpfMa + cpfRa) + cash + investments,
      expensesAnnual,
      cpfLifePayoutAnnual: cpfLifePayoutMonthly * 12,
      shortfallAnnual,
      isRetired: hasRetired
    });
  }

  return projection;
};

// --- MONTE CARLO SIMULATION ---

// Box-Muller transform to generate normally distributed random numbers
// Returns a random number with mean 0 and standard deviation 1
const randn_bm = () => {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); 
  while(v === 0) v = Math.random();
  return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
};

export const runMonteCarloSimulation = (
  inputs: WealthProjectionInputs,
  simulations: number = 500
) => {
  const allRuns: number[][] = [];
  const volatility = 0.12; // 12% Standard Deviation for equity markets (typical assumption)
  
  for (let i = 0; i < simulations; i++) {
    // Clone inputs but intercept the 'investments' rate inside the loop
    const runResult = [];
    
    // Initial state
    let investments = inputs.currentInvestments;
    let cash = inputs.currentCash;
    
    // We re-implement a lightweight version of the logic specifically for the investment part
    // to apply volatility year-over-year.
    // For performance, we simplify CPF/Cash parts to be deterministic (linear), 
    // and only randomize the Investment Return.
    
    // Re-run the main projection logic with randomized investment returns
    const yearsToProject = 95 - inputs.currentAge;
    
    // Copy mutable values
    let cpfOa = inputs.currentCpf.oa;
    let cpfSa = inputs.currentCpf.sa;
    let cpfMa = inputs.currentCpf.ma;
    let cpfRa = 0;
    let cpfLifePayoutMonthly = 0;
    
    let simInvestments = inputs.currentInvestments;
    let simCash = inputs.currentCash;
    let hasRetired = false;
    const PAYOUT_RATIO = 1700 / 205800;
    
    for (let y = 0; y <= yearsToProject; y++) {
      const age = inputs.currentAge + y;
      if (age >= inputs.retirementAge) hasRetired = true;

      // RANDOMIZED RETURN FOR THIS YEAR
      // Return = Expected Mean + (Volatility * RandomNormal)
      const randomReturn = inputs.rates.investments + (volatility * randn_bm());
      
      // Growth
      simInvestments *= (1 + randomReturn);
      simCash *= (1 + inputs.rates.cash);
      
      // Simplified CPF Growth (Deterministic)
      cpfOa *= (1 + inputs.rates.cpfOa);
      cpfSa *= (1 + inputs.rates.cpfSa);
      cpfMa *= (1 + inputs.rates.cpfSa);
      cpfRa *= 1.04;

      // Inflows
      if (!hasRetired) {
        // Add Contributions
        simInvestments += inputs.monthlyInvestment * 12;
        simCash += (Math.max(0, inputs.monthlyCashSavings - inputs.monthlyInvestment) * 12);
        
        // Add CPF (approx)
        const cpfData = computeCpf(inputs.monthlyIncome, age);
        cpfOa += cpfData.oa * 12;
        cpfSa += cpfData.sa * 12;
        cpfMa += cpfData.ma * 12;
      }

      // Events (55 RA, 65 CPF Life)
      if (Math.floor(age) === 55 && cpfRa === 0) {
         // Simplified RA Creation logic for Monte Carlo speed
         const frs = 205800 * Math.pow(1.035, 55 - inputs.currentAge);
         const takeSa = Math.min(cpfSa, frs);
         cpfSa -= takeSa;
         cpfRa += takeSa;
         if (takeSa < frs) {
            const takeOa = Math.min(cpfOa, frs - takeSa);
            cpfOa -= takeOa;
            cpfRa += takeOa;
         }
      }
      if (Math.floor(age) === 65 && cpfLifePayoutMonthly === 0) {
         cpfLifePayoutMonthly = cpfRa * PAYOUT_RATIO;
         cpfRa = 0;
      }

      // Outflows (Expenses)
      if (hasRetired) {
         const expenses = (inputs.expensesToday * 12) * Math.pow(1 + inputs.rates.inflation, y);
         const cpfPayout = cpfLifePayoutMonthly * 12;
         let needed = Math.max(0, expenses - cpfPayout);
         
         // Drain Cash first
         if (simCash >= needed) {
            simCash -= needed;
            needed = 0;
         } else {
            needed -= simCash;
            simCash = 0;
         }
         
         // Drain Investments
         if (needed > 0) {
            simInvestments -= needed;
         }
      }

      // Record Total Net Worth for this year in this simulation run
      const totalNetWorth = Math.max(0, simInvestments + simCash + cpfOa + cpfSa + cpfMa + cpfRa);
      runResult.push(totalNetWorth);
    }
    allRuns.push(runResult);
  }

  // Calculate Percentiles (10th, 50th, 90th)
  const years = allRuns[0].length;
  const p10 = [];
  const p50 = [];
  const p90 = [];

  for (let y = 0; y < years; y++) {
    const yearValues = allRuns.map(run => run[y]).sort((a, b) => a - b);
    p10.push(yearValues[Math.floor(simulations * 0.1)]);
    p50.push(yearValues[Math.floor(simulations * 0.5)]);
    p90.push(yearValues[Math.floor(simulations * 0.9)]);
  }

  return { p10, p50, p90 };
};

export const calculateChildEducationCost = (child: Child, settings?: EducationSettings) => {
  if (!child.dobISO) return 0;
  const childDob = parseDob(child.dobISO);
  if (!childDob) return 0;
  
  const today = new Date();
  const ageInMonths = monthsSinceDob(childDob, today.getFullYear(), today.getMonth());
  const currentAge = Math.floor(ageInMonths / 12);
  
  // Extract Settings or use Defaults
  const inflationRate = settings ? toNum(settings.inflationRate, 3)/100 : 0.03;
  
  // Education Cost & Duration Logic
  // Default: $800/mo (was 9600/yr), P1(7yo) to O-Level(16yo)
  const monthlyCost = settings ? toNum(settings.monthlyEducationCost, 800) : 800;
  const annualEduCost = monthlyCost * 12;
  
  const eduStartAge = settings ? toNum(settings.educationStartAge, 7) : 7;
  const eduDuration = settings ? toNum(settings.educationDuration, 10) : 10;
  const eduEndAge = eduStartAge + eduDuration - 1;

  // University
  const costUni = settings ? toNum(settings.universityCost, 8750) : 8750;
  const durUni = settings ? toNum(settings.universityDuration, 4) : 4;

  // Gender-specific university start age (males after NS, females direct entry)
  const uniStartAge = child.gender === 'male' ? 21 : 19;
  const uniEndAge = uniStartAge + durUni - 1;
  
  const stages = [
    // Dynamic Primary/Secondary Phase
    { start: eduStartAge, end: eduEndAge, yearlyCost: annualEduCost },
    // University
    { start: uniStartAge, end: uniEndAge, yearlyCost: costUni },
  ];
  
  let totalCost = 0;
  stages.forEach(stage => {
    if (currentAge <= stage.end) {
      const yearsUntilStart = Math.max(0, stage.start - currentAge);
      const duration = stage.end - Math.max(stage.start, currentAge) + 1;
      if (duration > 0) {
        for (let year = 0; year < duration; year++) {
          const yearsFromNow = yearsUntilStart + year;
          totalCost += stage.yearlyCost * Math.pow(1 + inflationRate, yearsFromNow);
        }
      }
    }
  });
  return totalCost;
};

export const getBaseRetirementExpense = (
  profile: Profile,
  totalMonthlyExpenses: number,
  cpfData: CpfData | null,
  cashflowData?: CashflowData | null
): number => {
  const custom = toNum(profile.customRetirementExpense, 0);
  if (custom > 0) return custom;
  if (totalMonthlyExpenses > 0) return totalMonthlyExpenses;
  if (cashflowData && cashflowData.totalExpenses > 0) return cashflowData.totalExpenses * 0.7;
  if (cpfData) return cpfData.takeHome * 0.7;
  return 0;
};
