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

const pctOf = (value, base) => (base > 0 ? (value / base) * 100 : 0);

export const buildCockpitChartData = (months, essentialCategories) => {
  const essentialSet = buildEssentialCategorySet(essentialCategories);

  let cumulative = 0;
  let cumulativeEssential = 0;
  let cumulativeNonEssential = 0;
  let cumulativeIncome = 0;
  let cumulativeSavingsCategories = 0;
  let totalMonthlySavingsCategories = 0;
  let totalIncome = 0;

  const data = months.map((month) => {
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
    totalMonthlySavingsCategories += monthlySavingsCategories;
    const monthlySavingsAllocation = Math.max(income - monthlyEssential - monthlyNonEssential, 0);
    const cumulativeSavingsAllocation =
      cumulativeIncome - cumulativeEssential - cumulativeNonEssential;
    const cumulativeSpending = cumulativeEssential + cumulativeNonEssential;
    const cumulativeSavingRate = pctOf(cumulative, cumulativeIncome);

    return {
      month: formatMonth(month.month),
      monthKey: month.month,
      monthlySavings,
      cumulativeSavings: cumulative,
      savingRate,
      cumulativeSavingRate,
      monthlyIncome: income,
      cumulativeIncome,
      monthlyEssential,
      monthlyNonEssential,
      monthlySavingsAllocation,
      cumulativeEssential,
      cumulativeNonEssential,
      cumulativeSavingsAllocation: Math.max(cumulativeSavingsAllocation, 0),
      cumulativeSpending,
      monthlyEssentialPct: pctOf(monthlyEssential, income),
      monthlyNonEssentialPct: pctOf(monthlyNonEssential, income),
      monthlySavingsAllocationPct: pctOf(monthlySavingsAllocation, income),
      cumulativeEssentialPct: pctOf(cumulativeEssential, cumulativeIncome),
      cumulativeNonEssentialPct: pctOf(cumulativeNonEssential, cumulativeIncome),
      cumulativeSavingsAllocationPct: pctOf(
        Math.max(cumulativeSavingsAllocation, 0),
        cumulativeIncome
      ),
      cumulativeSpendingPct: pctOf(cumulativeSpending, cumulativeIncome)
    };
  });

  const last = data[data.length - 1];
  const totalMonthlyEssential = data.reduce((sum, point) => sum + point.monthlyEssential, 0);
  const totalMonthlyNonEssential = data.reduce((sum, point) => sum + point.monthlyNonEssential, 0);
  const totalMonthlySavings = data.reduce((sum, point) => sum + point.monthlySavings, 0);
  const avgMonthlySavings = data.length > 0 ? totalMonthlySavings / data.length : 0;

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
    totalCumulativeSavingsCategories: cumulativeSavingsCategories,
    totalMonthlyEssential,
    totalMonthlyNonEssential,
    totalMonthlySavingsCategories,
    totalMonthlySavings,
    avgMonthlySavings
  };
};
