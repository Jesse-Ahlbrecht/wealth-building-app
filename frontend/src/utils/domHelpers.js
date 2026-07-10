export const scrollToDrilldown = () => {
  document.getElementById('drilldown-details')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
};

export const selectMonthFromChart = (
  summary,
  clickedData,
  selectedMonth,
  setSelectedMonth,
  { section, setSection, scrollOnSectionChange = false } = {}
) => {
  const monthData = summary.find((m) => m.month === clickedData.monthKey);
  if (!monthData) return;
  const isSameMonth = selectedMonth?.month === monthData.month;
  setSelectedMonth(monthData);
  if (setSection) {
    if (section != null) {
      setSection(section);
    } else if (!isSameMonth) {
      setSection(null);
    }
  }
  if (!isSameMonth || scrollOnSectionChange) {
    setTimeout(scrollToDrilldown, 100);
  }
};
