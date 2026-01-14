
// CPF Ordinary Wage Ceiling - Graduated increases:
// 2023 (Sep-Dec): $6,300
// 2024: $6,800
// 2025: $7,400 ← CURRENT
// 2026+: $8,000
export const CPF_WAGE_CEILING = 7400; // 2025 ceiling

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

// Returns the CPF allocation rates for OA, SA, MA based on age (2025 rates)
// These percentages are of the total CPF contribution
export const getCpfAllocation = (age: number) => {
  if (age <= 35) return { oa: 0.6216, sa: 0.1622, ma: 0.2162 }; // Total: 37%
  if (age <= 45) return { oa: 0.5676, sa: 0.1892, ma: 0.2432 }; // Total: 37%
  if (age <= 50) return { oa: 0.5135, sa: 0.2162, ma: 0.2703 }; // Total: 37%
  if (age <= 55) return { oa: 0.4324, sa: 0.2703, ma: 0.2973 }; // Total: 37%
  if (age <= 60) return { oa: 0.2973, sa: 0.3514, ma: 0.3514 }; // Total: 32.5%
  if (age <= 65) return { oa: 0.1362, sa: 0.3915, ma: 0.4723 }; // Total: 23.5%
  if (age <= 70) return { oa: 0.1212, sa: 0.3030, ma: 0.5758 }; // Total: 16.5%
  return { oa: 0.08, sa: 0.265, ma: 0.655 }; // Total: 12.5% (>70)
};