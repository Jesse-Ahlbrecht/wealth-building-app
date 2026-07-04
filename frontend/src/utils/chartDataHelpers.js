import { formatMonth } from '../utils';
import {
  getLoanPaymentFromExpenseCategories,
  splitExpenseCategoryAmounts,
  sumCategoryAmounts,
  mergeSavingsCategories
} from './categoryHelpers';

export const sortMonthsChronologically = (summary) =>
  [...summary].sort((a, b) => new Date(a.month + '-01') - new Date(b.month + '-01'));

export const getLastNMonths = (summary, count) =>
  sortMonthsChronologically(summary).slice(-count);

export const buildMonthlySavingsPoint = (month, includeLoanPayments = false) => {
  const monthlyLoanPayment = getLoanPaymentFromExpenseCategories(month.expenseCategories);
  const baseSavings = month.savings || 0;
  const adjustedSavings = includeLoanPayments ? baseSavings + monthlyLoanPayment : baseSavings;
  const income = month.income || 0;
  const adjustedSavingsRate = income > 0 ? (adjustedSavings / income) * 100 : 0;
  const baseSavingsRate = month.savingRate || 0;

  return {
    month: formatMonth(month.month),
    monthKey: month.month,
    savings: adjustedSavings,
    savingRate: includeLoanPayments ? adjustedSavingsRate : baseSavingsRate,
    income,
    expenses: month.expenses || 0,
    loanPayment: monthlyLoanPayment
  };
};

export const buildMonthlySavingsPoints = (summary, includeLoanPayments = false) =>
  sortMonthsChronologically(summary).map((month) =>
    buildMonthlySavingsPoint(month, includeLoanPayments)
  );

export const buildCockpitChartData = (
  summary,
  essentialCategories,
  monthCount = 12,
  includeLoanPayments = false
) => {
  const lastMonths = getLastNMonths(summary, monthCount);

  let cumulative = 0;
  let cumulativeEssential = 0;
  let cumulativeNonEssential = 0;
  let cumulativeIncome = 0;
  let cumulativeSavingsCategories = 0;
  let totalIncome = 0;

  const data = lastMonths.map((month) => {
    const income = month.income || 0;
    const savingsPoint = buildMonthlySavingsPoint(month, includeLoanPayments);
    const monthlySavings = savingsPoint.savings;
    cumulative += monthlySavings;
    cumulativeIncome += income;
    totalIncome += income;
    const savingRate = savingsPoint.savingRate;

    const { essential, nonEssential, savingsCategories: expenseSavingsCategories } =
      splitExpenseCategoryAmounts(month.expenseCategories, essentialCategories, false);
    const monthlyEssential = sumCategoryAmounts(essential);
    const monthlyNonEssential = sumCategoryAmounts(nonEssential);
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
