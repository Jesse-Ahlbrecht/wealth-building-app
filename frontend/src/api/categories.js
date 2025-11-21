/**
 * Categories API
 */

import apiClient from './client';

export const categoriesAPI = {
  async getCategories() {
    return apiClient.get('/api/categories');
  },

  async createCategory(name, type) {
    return apiClient.post('/api/categories', { name, type });
  },

  async getEssentialCategories() {
    return apiClient.get('/api/essential-categories');
  },

  async saveEssentialCategories(categories) {
    return apiClient.post('/api/essential-categories', { categories });
  }
};

