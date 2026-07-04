export const scrollToDrilldown = () => {
  document.getElementById('drilldown-details')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
};

export const selectMonthFromChart = (summary, clickedData, selectedMonth, setSelectedMonth) => {
  const monthData = summary.find((m) => m.month === clickedData.monthKey);
  if (!monthData) return;
  const isSameMonth = selectedMonth?.month === monthData.month;
  setSelectedMonth(monthData);
  if (!isSameMonth) {
    setTimeout(scrollToDrilldown, 100);
  }
};
