import { useCallback, useEffect, useState } from 'react';
import { loadAvailableCategoriesWithFallback, loadEssentialCategoriesWithFallback } from '../api/categories';

export function useCategoryData() {
  const [essentialCategories, setEssentialCategories] = useState([]);
  const [availableCategories, setAvailableCategories] = useState({ income: [], expense: [] });

  const refreshCategories = useCallback(async () => {
    const categories = await loadAvailableCategoriesWithFallback();
    setAvailableCategories(categories);
    return categories;
  }, []);

  useEffect(() => {
    loadEssentialCategoriesWithFallback().then(setEssentialCategories);
    refreshCategories();
  }, [refreshCategories]);

  return { essentialCategories, availableCategories, refreshCategories };
}
