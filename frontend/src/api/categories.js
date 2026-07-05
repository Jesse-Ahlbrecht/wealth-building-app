import apiClient from './client';
import { unwrapList } from '../utils/predictionHelpers';
import { normalizeCategoryList } from '../utils/categoryHelpers';

export { getCategoryNames, normalizeCategoryEntry, normalizeCategoryList } from '../utils/categoryHelpers';

export const DEFAULT_ESSENTIAL_CATEGORIES = ['Rent', 'Insurance', 'Groceries', 'Utilities'];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Groceries', 'Cafeteria', 'Food and Dining', 'Shopping', 'Transport',
  'Subscriptions', 'Utilities', 'Health', 'Loan Payment', 'Investment Account Payment', 'Rent',
  'Insurance', 'Other'
];

export const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Income', 'Other'];

export const categoriesAPI = {
  async getCategories() {
    return apiClient.get('/api/categories');
  },

  async createCategory(name, type) {
    return apiClient.post('/api/categories', { name, type });
  },

  async getEssentialCategories() {
    return unwrapList(await apiClient.get('/api/essential-categories'));
  },

  async suggestCategory(transaction) {
    return apiClient.post('/api/suggest-category', { transaction });
  }
};

export async function loadEssentialCategoriesWithFallback() {
  try {
    return await categoriesAPI.getEssentialCategories();
  } catch (err) {
    console.error('Error loading essential categories:', err);
    return DEFAULT_ESSENTIAL_CATEGORIES;
  }
}

export async function loadAvailableCategoriesWithFallback() {
  try {
    const categories = await categoriesAPI.getCategories();
    return {
      income: normalizeCategoryList(categories.income),
      expense: normalizeCategoryList(categories.expense)
    };
  } catch (err) {
    console.error('Error loading available categories:', err);
    return {
      income: DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, source: 'system' })),
      expense: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, source: 'system' }))
    };
  }
}
