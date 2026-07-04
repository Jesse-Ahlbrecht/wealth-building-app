import { useEffect, useState } from 'react';
import { loadAvailableCategoriesWithFallback, loadEssentialCategoriesWithFallback } from '../api/categories';

export function useCategoryData() {
  const [essentialCategories, setEssentialCategories] = useState([]);
  const [availableCategories, setAvailableCategories] = useState({ income: [], expense: [] });

  useEffect(() => {
    loadEssentialCategoriesWithFallback().then(setEssentialCategories);
    loadAvailableCategoriesWithFallback().then(setAvailableCategories);
  }, []);

  return { essentialCategories, availableCategories };
}
