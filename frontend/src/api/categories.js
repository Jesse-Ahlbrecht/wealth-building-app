import apiClient from './client';
import { unwrapList } from '../utils/predictionHelpers';

export const DEFAULT_ESSENTIAL_CATEGORIES = ['Rent', 'Insurance', 'Groceries', 'Utilities'];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Groceries', 'Cafeteria', 'Outsourced Cooking', 'Dining', 'Shopping', 'Transport',
  'Subscriptions', 'Utilities', 'Loan Payment', 'Investment Account Payment', 'Rent',
  'Insurance', 'Transfer', 'Other'
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
    const response = await categoriesAPI.getCategories();
    const categories = response?.data || response || {};
    return {
      income: Array.isArray(categories.income) ? categories.income : [],
      expense: Array.isArray(categories.expense) ? categories.expense : []
    };
  } catch (err) {
    console.error('Error loading available categories:', err);
    return {
      income: DEFAULT_INCOME_CATEGORIES,
      expense: DEFAULT_EXPENSE_CATEGORIES
    };
  }
}
