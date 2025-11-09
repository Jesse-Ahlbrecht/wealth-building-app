export const SAVINGS_GOAL_CHF = 3000; // Monthly savings goal in CHF
export const EUR_TO_CHF_RATE = 0.9355; // Exchange rate: 1 EUR = 0.9355 CHF (update as needed)
export const SAVINGS_GOAL_EUR = SAVINGS_GOAL_CHF / EUR_TO_CHF_RATE; // Monthly savings goal in EUR
export const SAVINGS_RATE_GOAL = 20; // Target savings rate percentage

export const convertAmountToCurrency = (amount, currency) => {
  if (!Number.isFinite(amount)) return 0;

  if (currency === 'CHF') {
    return amount * EUR_TO_CHF_RATE;
  }

  return amount;
};

// Function to get color based on percentage of goal achieved
export const getColorForPercentage = (percentage) => {
  // Clamp percentage between 0 and 150 (allowing for over-achievement to still be green)
  const clampedPercentage = Math.min(Math.max(percentage, 0), 150);

  if (clampedPercentage < 50) {
    // Red to Orange (0-50%)
    const ratio = clampedPercentage / 50;
    return `rgb(${239}, ${Math.round(68 + ratio * (251 - 68))}, ${Math.round(68 + ratio * (146 - 68))})`;
  } else if (clampedPercentage < 100) {
    // Orange to Yellow (50-100%)
    const ratio = (clampedPercentage - 50) / 50;
    return `rgb(${Math.round(251 - ratio * (251 - 234))}, ${Math.round(146 + ratio * (179 - 146))}, ${Math.round(146 - ratio * 146)})`;
  } else {
    // Yellow to Green (100-150%)
    const ratio = Math.min((clampedPercentage - 100) / 50, 1);
    return `rgb(${Math.round(234 - ratio * (234 - 16))}, ${Math.round(179 + ratio * (185 - 179))}, ${Math.round(0 + ratio * 129)})`;
  }
};

