import { formatMonth, sortMonthsChronologically } from './dateHelpers';
import {
  buildEssentialCategorySet,
  computeMonthExpenseBreakdown,
  mergeSavingsCategories,
  sumCategoryAmounts
} from './categoryHelpers';

export { sortMonthsChronologically, sortMonthsReverseChronologically } from './dateHelpers';

export const getLastNMonths = (summary, count) =>
  sortMonthsChronologically(summary).slice(-count);

export const buildMonthlySavingsPoint = (month, essentialCategories = [], essentialSet = null) => {
  const { savings, savingRate, income } = computeMonthExpenseBreakdown(
    month,
    essentialCategories,
    essentialSet
  );

  return {
    month: formatMonth(month.month),
    monthKey: month.month,
    savings,
    savingRate,
    income,
    expenses: month.expenses || 0
  };
};

export const buildCockpitChartData = (
  summary,
  essentialCategories,
  monthCount = 12
) => {
  const lastMonths = getLastNMonths(summary, monthCount);
  const essentialSet = buildEssentialCategorySet(essentialCategories);

  let cumulative = 0;
  let cumulativeEssential = 0;
  let cumulativeNonEssential = 0;
  let cumulativeIncome = 0;
  let cumulativeSavingsCategories = 0;
  let totalIncome = 0;

  const data = lastMonths.map((month) => {
    const {
      expenseSavingsCategories,
      essentialTotal: monthlyEssential,
      nonEssentialTotal: monthlyNonEssential,
      savings: monthlySavings,
      savingRate,
      income
    } = computeMonthExpenseBreakdown(month, essentialCategories, essentialSet);

    cumulative += monthlySavings;
    cumulativeIncome += income;
    totalIncome += income;

    const monthlySavingsCategories = sumCategoryAmounts(
      mergeSavingsCategories(month, expenseSavingsCategories)
    );
    cumulativeEssential += monthlyEssential;
    cumulativeNonEssential += monthlyNonEssential;
    cumulativeSavingsCategories += monthlySavingsCategories;
    const monthlySavingsAllocation = Math.max(income - monthlyEssential - monthlyNonEssential, 0);
    const cumulativeSavingsAllocation =
      cumulativeIncome - cumulativeEssential - cumulativeNonEssential;

    return {
      month: formatMonth(month.month),
      monthKey: month.month,
      monthlySavings,
      cumulativeSavings: cumulative,
      savingRate,
      monthlyIncome: income,
      cumulativeIncome,
      monthlyEssential,
      monthlyNonEssential,
      monthlySavingsCategories,
      monthlySavingsAllocation,
      cumulativeEssential,
      cumulativeNonEssential,
      cumulativeSavingsCategories,
      cumulativeSavingsAllocation: Math.max(cumulativeSavingsAllocation, 0),
      cumulativeSpending: cumulativeEssential + cumulativeNonEssential
    };
  });

  const last = data[data.length - 1];
  return {
    chartData: data,
    totalCumulative: last?.cumulativeSavings ?? 0,
    overallSavingRate: totalIncome > 0 ? (last?.cumulativeSavings ?? 0) / totalIncome * 100 : 0,
    avgSavingRate: data.length > 0
      ? data.reduce((sum, point) => sum + point.savingRate, 0) / data.length
      : 0,
    totalCumulativeEssential: last?.cumulativeEssential ?? 0,
    totalCumulativeNonEssential: last?.cumulativeNonEssential ?? 0,
    totalCumulativeIncome: last?.cumulativeIncome ?? 0,
    totalCumulativeSavingsCategories: last?.cumulativeSavingsCategories ?? 0,
    totalCumulativeSpending: last?.cumulativeSpending ?? 0
  };
};
