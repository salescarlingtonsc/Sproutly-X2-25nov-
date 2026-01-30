
// CPF Ordinary Wage Ceiling - Graduated increases:
// 2023 (Sep-Dec): $6,300
// 2024: $6,800
// 2025: $7,400 ← CURRENT
// 2026+: $8,000
export const CPF_WAGE_CEILING = 7400; // 2025 ceiling

// Basic Healthcare Sum (BHS) 2025
export const CPF_BHS_LIMIT = 74000;

export const getCpfRates = (age: number) => {
  if (age <= 35) return { employee: 0.20, employer: 0.17 };
  if (age <= 45) return { employee: 0.20, employer: 0.17 };
  if (age <= 50) return { employee: 0.20, employer: 0.17 };
  if (age <= 55) return { employee: 0.20, employer: 0.17 };
  if (age <= 60) return { employee: 0.17, employer: 0.155 };
  if (age <= 65) return { employee: 0.115, employer: 0.12 };
  if (age <= 70) return { employee: 0.075, employer: 0.09 };
  return { employee: 0.05, employer: 0.075 };
};

// Returns the CPF allocation rates for OA, SA, MA based on age (2025 Allocation Rates)
// Returns exact % of WAGE (not ratio of contribution)
export const getCpfAllocation = (age: number) => {
  if (age <= 35) return { oa: 0.23, sa: 0.06, ma: 0.08 };       // Total 37%
  if (age <= 45) return { oa: 0.21, sa: 0.07, ma: 0.09 };       // Total 37%
  if (age <= 50) return { oa: 0.19, sa: 0.08, ma: 0.10 };       // Total 37%
  if (age <= 55) return { oa: 0.15, sa: 0.115, ma: 0.105 };     // Total 37%
  if (age <= 60) return { oa: 0.12, sa: 0.035, ma: 0.17 };      // Total 32.5%
  if (age <= 65) return { oa: 0.035, sa: 0.025, ma: 0.175 };    // Total 23.5%
  if (age <= 70) return { oa: 0.01, sa: 0.01, ma: 0.145 };      // Total 16.5%
  return { oa: 0.01, sa: 0.01, ma: 0.105 };                     // Total 12.5% (>70)
};
