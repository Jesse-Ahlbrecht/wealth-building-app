export const getMonthKeyFromDate = (dateValue) => {
  if (!dateValue) return '';
  return String(dateValue).slice(0, 7);
};

export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatMonth = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

export const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const getPreviousMonth = (monthStr) => {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const sortMonthsChronologically = (summary) =>
  [...summary].sort((a, b) => new Date(a.month + '-01') - new Date(b.month + '-01'));

export const sortMonthsReverseChronologically = (summary) =>
  [...summary].sort((a, b) => new Date(b.month + '-01') - new Date(a.month + '-01'));

