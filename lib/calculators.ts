
import { toNum, monthsSinceDob, parseDob } from './helpers';
import { CPF_WAGE_CEILING, CPF_BHS_LIMIT, getCpfRates, getCpfAllocation } from './cpfRules';
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
  
  // Calculate account specific values based on Wage %
  // Note: There might be slight rounding differences vs CPF calculator due to float precision, 
  // but using direct wage % is the official method.
  const oa = cpfableSalary * allocation.oa;
  const sa = cpfableSalary * allocation.sa;
  const ma = cpfableSalary * allocation.ma;

  return {
    employee: employeeContrib,
    employer: employerContrib,
    total: totalContrib,
    oa,
    sa,
    ma,
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
  const FRS_INFLATION = 0.035; // FRS grows ~3.5% annually
  const BHS_INFLATION = 0.04; // BHS grows roughly 4-5% annually
  
  // CPF Life Standard Plan Estimator
  const PAYOUT_RATIO = 1700 / 205800; 
  
  for (let y = 0; y <= yearsToProject; y++) {
    const age = currentAge + y;
    
    // Retirement Flag
    if (age >= retirementAge) {
      hasRetired = true;
    }

    // --- 1. GROWTH (Start of Year Balance Growth) ---
    cpfOa *= (1 + rates.cpfOa);
    // SA is closed after 55, checking logic below
    if (age < 55) {
        cpfSa *= (1 + rates.cpfSa);
    } else {
        // Post-55 SA Closure Rule: Any remaining SA (if somehow existed) gets SA interest rate,
        // but practically it should be 0. We'll apply interest just in case of transient funds.
        cpfSa *= (1 + rates.cpfSa); 
    }
    cpfMa *= (1 + rates.cpfSa); // MA grows same as SA/RA (~4%)
    cpfRa *= 1.0408; // RA grows at ~4.08%
    
    cash *= (1 + rates.cash);
    investments *= (1 + rates.investments);

    // --- 2. CONTRIBUTIONS (If working) ---
    if (!hasRetired) {
      // CPF Contributions
      const cpfData = computeCpf(monthlyIncome, age);
      cpfOa += cpfData.oa * 12;
      
      // Post-55, SA contribution allocation goes to RA (if deficient) or OA/SA special handling?
      // CPF allocation tables for >55 usually split into OA/SA/MA.
      // However, "SA" contributions for >55s now flow to RA (up to FRS) then OA.
      // We will simplify: If <55 put in SA. If >=55 put in RA.
      if (age < 55) {
          cpfSa += cpfData.sa * 12;
      } else {
          cpfRa += cpfData.sa * 12; 
      }
      
      cpfMa += cpfData.ma * 12;

      // Cash & Investments
      const actualCashSavings = Math.max(0, monthlyCashSavings - monthlyInvestment);
      cash += actualCashSavings * 12;
      investments += monthlyInvestment * 12;
    }

    // --- 2b. MEDISAVE CAP CHECK (BHS OVERFLOW) ---
    // BHS stops increasing at age 65 (Fixed for cohort)
    let currentBHS = CPF_BHS_LIMIT;
    if (age < 65) {
       currentBHS = CPF_BHS_LIMIT * Math.pow(1 + BHS_INFLATION, y);
    } else {
       const yearsTo65 = 65 - currentAge;
       currentBHS = CPF_BHS_LIMIT * Math.pow(1 + BHS_INFLATION, Math.max(0, yearsTo65));
    }

    // OVERFLOW LOGIC
    if (cpfMa > currentBHS) {
        const overflow = cpfMa - currentBHS;
        cpfMa = currentBHS; // Cap MA
        
        if (age < 55) {
            // Under 55: Overflow goes to SA
            cpfSa += overflow;
        } else {
            // 55 & Above: SA is closed. Overflow goes to RA (to help meet FRS) then OA.
            // For projection simplicity: We put it in RA to maximize interest (4%) unless RA is huge.
            // A more conservative view would be OA. Let's split 50/50 or prioritize RA.
            // Priority: RA.
            cpfRa += overflow;
        }
    }

    // --- 3. KEY EVENTS ---
    
    // EVENT: AGE 55 (Creation of RA + Closure of SA)
    if (Math.floor(age) === 55 && cpfRa === 0) {
      // Projected FRS at Age 55
      const yearsTo55 = 55 - currentAge;
      const projectedFRS = yearsTo55 > 0 
        ? CURRENT_FRS * Math.pow(1 + FRS_INFLATION, yearsTo55)
        : CURRENT_FRS; 

      // 1. Transfer SA to RA
      // New 2025 Rule: SA Closes.
      let transferToRa = Math.min(cpfSa, projectedFRS);
      cpfRa += transferToRa;
      cpfSa -= transferToRa; // Remaining SA is not kept in SA anymore!
      
      // 2. Any remaining SA flows to OA
      if (cpfSa > 0) {
          cpfOa += cpfSa;
          cpfSa = 0; // SA is effectively closed/empty
      }

      // 3. If RA still not FRS, take from OA
      if (cpfRa < projectedFRS) {
          const needed = projectedFRS - cpfRa;
          const takeFromOa = Math.min(cpfOa, needed);
          cpfOa -= takeFromOa;
          cpfRa += takeFromOa;
      }
    }

    // EVENT: AGE 65 (CPF LIFE START)
    if (Math.floor(age) === 65 && cpfLifePayoutMonthly === 0) {
      // Standard Plan Calculation
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
      const randomReturn = inputs.rates.investments + (volatility * randn_bm());
      
      // Growth
      simInvestments *= (1 + randomReturn);
      simCash *= (1 + inputs.rates.cash);
      
      cpfOa *= (1 + inputs.rates.cpfOa);
      // SA interest only applied if < 55 due to closure rule
      if (age < 55) cpfSa *= (1 + inputs.rates.cpfSa);
      cpfMa *= (1 + inputs.rates.cpfSa);
      cpfRa *= 1.04;

      // Inflows
      if (!hasRetired) {
        simInvestments += inputs.monthlyInvestment * 12;
        simCash += (Math.max(0, inputs.monthlyCashSavings - inputs.monthlyInvestment) * 12);
        
        // Add CPF (approx)
        const cpfData = computeCpf(inputs.monthlyIncome, age);
        cpfOa += cpfData.oa * 12;
        if (age < 55) cpfSa += cpfData.sa * 12;
        else cpfRa += cpfData.sa * 12; // Post-55 SA contrib goes to RA/OA
        cpfMa += cpfData.ma * 12;
      }

      // Events (55 RA)
      if (Math.floor(age) === 55 && cpfRa === 0) {
         const frs = 205800 * Math.pow(1.035, 55 - inputs.currentAge);
         // Move SA to RA
         const takeSa = Math.min(cpfSa, frs);
         cpfSa -= takeSa;
         cpfRa += takeSa;
         
         // Remaining SA to OA
         if (cpfSa > 0) {
             cpfOa += cpfSa;
             cpfSa = 0;
         }

         // If RA needs more, take OA
         if (cpfRa < frs) {
            const takeOa = Math.min(cpfOa, frs - cpfRa);
            cpfOa -= takeOa;
            cpfRa += takeOa;
         }
      }
      
      // Event 65
      if (Math.floor(age) === 65 && cpfLifePayoutMonthly === 0) {
         cpfLifePayoutMonthly = cpfRa * PAYOUT_RATIO;
         cpfRa = 0;
      }

      // Outflows (Expenses)
      if (hasRetired) {
         const expenses = (inputs.expensesToday * 12) * Math.pow(1 + inputs.rates.inflation, y);
         const cpfPayout = cpfLifePayoutMonthly * 12;
         let needed = Math.max(0, expenses - cpfPayout);
         
         if (simCash >= needed) {
            simCash -= needed;
            needed = 0;
         } else {
            needed -= simCash;
            simCash = 0;
         }
         
         if (needed > 0) {
            simInvestments -= needed;
         }
      }

      const totalNetWorth = Math.max(0, simInvestments + simCash + cpfOa + cpfSa + cpfMa + cpfRa);
      runResult.push(totalNetWorth);
    }
    allRuns.push(runResult);
  }

  // Calculate Percentiles
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
  
  const inflationRate = settings ? toNum(settings.inflationRate, 3)/100 : 0.03;
  const monthlyCost = settings ? toNum(settings.monthlyEducationCost, 800) : 800;
  const annualEduCost = monthlyCost * 12;
  const eduStartAge = settings ? toNum(settings.educationStartAge, 7) : 7;
  const eduDuration = settings ? toNum(settings.educationDuration, 10) : 10;
  const eduEndAge = eduStartAge + eduDuration - 1;
  const costUni = settings ? toNum(settings.universityCost, 8750) : 8750;
  const durUni = settings ? toNum(settings.universityDuration, 4) : 4;
  const uniStartAge = child.gender === 'male' ? 21 : 19;
  const uniEndAge = uniStartAge + durUni - 1;
  
  const stages = [
    { start: eduStartAge, end: eduEndAge, yearlyCost: annualEduCost },
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
