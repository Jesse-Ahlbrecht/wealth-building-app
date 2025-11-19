import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  SAVINGS_GOAL_CHF,
  SAVINGS_RATE_GOAL,
  getColorForPercentage
} from '../utils/finance';

const ChartsPage = ({
  chartData,
  timeRange,
  onChangeTimeRange,
  chartView,
  onChangeChartView,
  includeLoanPayments,
  onToggleIncludeLoanPayments,
  summary,
  formatMonth,
  formatCurrency,
  formatDate,
  expandedCategories,
  toggleCategory,
  categorySorts,
  toggleSort,
  getSortedTransactions,
  handleCategoryEdit,
  pendingCategoryChange,
  showEssentialSplit,
  essentialCategories,
  categoryEditModal,
  handlePredictionClick,
  handleDismissPrediction,
  setShowEssentialCategoriesModal,
  defaultCurrency,
  getTransactionKey,
  selectedMonth,
  onSelectMonth,
  MonthDetailComponent
}) => {
  // Filter data based on time range
  const getFilteredData = () => {
    if (timeRange === 'all') return chartData;

    const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    return chartData.slice(-months);
  };

  const filteredData = getFilteredData();

  // Calculate averages and totals
  const totalSavings = filteredData.reduce((sum, month) => sum + month.savings, 0);
  const avgSavings = filteredData.length ? totalSavings / filteredData.length : 0;
  const totalSavingRate = filteredData.reduce((sum, month) => sum + month.savingRate, 0);
  const avgSavingRate = filteredData.length ? totalSavingRate / filteredData.length : 0;

  const MonthDetail = MonthDetailComponent;

  return (
    <div className="charts-container" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="chart-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <h3 className="chart-title" style={{ marginBottom: '4px' }}>Savings Over Time</h3>
            <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {chartView === 'absolute' ? (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavings / SAVINGS_GOAL_CHF) * 100)
                      }}
                    >
                      {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(avgSavings)}
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-light)' }}>
                      ({((avgSavings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal)
                    </span>
                    {includeLoanPayments && (
                      <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>
                        (incl. actual loan payments)
                      </span>
                    )}
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(totalSavings)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Average:{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: getColorForPercentage((avgSavingRate / SAVINGS_RATE_GOAL) * 100)
                      }}
                    >
                      {avgSavingRate.toFixed(1)}%
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-light)' }}>
                      ({((avgSavingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal)
                    </span>
                    {includeLoanPayments && (
                      <span style={{ marginLeft: '8px', color: '#f59e0b', fontSize: '12px' }}>
                        (incl. actual loan payments)
                      </span>
                    )}
                  </div>
                  <div>
                    Total:{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {totalSavingRate.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="time-range-selector">
              <button
                className={`time-range-btn ${timeRange === '3m' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('3m')}
              >
                3M
              </button>
              <button
                className={`time-range-btn ${timeRange === '6m' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('6m')}
              >
                6M
              </button>
              <button
                className={`time-range-btn ${timeRange === '1y' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('1y')}
              >
                1Y
              </button>
              <button
                className={`time-range-btn ${timeRange === 'all' ? 'active' : ''}`}
                onClick={() => onChangeTimeRange('all')}
              >
                All
              </button>
            </div>
            <div className="chart-toggle">
              <button
                className={`chart-toggle-btn ${chartView === 'absolute' ? 'active' : ''}`}
                onClick={() => onChangeChartView('absolute')}
              >
                Absolute
              </button>
              <button
                className={`chart-toggle-btn ${chartView === 'relative' ? 'active' : ''}`}
                onClick={() => onChangeChartView('relative')}
              >
                Rate
              </button>
            </div>
            <div className="loan-payment-toggle">
              <button
                className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
                onClick={onToggleIncludeLoanPayments}
                title="Include monthly loan payments in savings calculation"
              >
                Include Loans
              </button>
            </div>
          </div>
        </div>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={filteredData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={(data) => {
                if (data && data.activePayload && data.activePayload[0]) {
                  const clickedData = data.activePayload[0].payload;
                  // Find the full month data from summary
                  const monthData = summary.find((m) => formatMonth(m.month) === clickedData.month);
                  if (monthData) {
                    onSelectMonth(monthData);
                    // Scroll to drilldown details after a short delay to allow rendering
                    setTimeout(() => {
                      const element = document.getElementById('drilldown-details');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 100);
                  }
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
                label={{
                  value: chartView === 'absolute' ? 'Savings (CHF)' : 'Savings Rate (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'var(--color-text-tertiary)' }
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--color-text-primary)',
                  boxShadow: '0 4px 12px var(--color-shadow-md)'
                }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div
                        style={{
                          backgroundColor: 'var(--color-bg-card)',
                          border: '1px solid var(--color-border-primary)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: 'var(--color-text-primary)',
                          boxShadow: '0 4px 12px var(--color-shadow-md)'
                        }}
                      >
                        <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.month}</p>
                        {chartView === 'absolute' ? (
                          <>
                            <p
                              style={{
                                margin: 0,
                                color: getColorForPercentage((data.savings / SAVINGS_GOAL_CHF) * 100)
                              }}
                            >
                              Savings:{' '}
                              {new Intl.NumberFormat('de-CH', {
                                style: 'currency',
                                currency: 'CHF',
                                minimumFractionDigits: 2
                              }).format(data.savings)}
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes{' '}
                                {new Intl.NumberFormat('de-CH', {
                                  style: 'currency',
                                  currency: 'CHF',
                                  minimumFractionDigits: 2
                                }).format(data.loanPayment)}{' '}
                                loan payment)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                              {((data.savings / SAVINGS_GOAL_CHF) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        ) : (
                          <>
                            <p
                              style={{
                                margin: 0,
                                color: getColorForPercentage((data.savingRate / SAVINGS_RATE_GOAL) * 100)
                              }}
                            >
                              Savings Rate: {data.savingRate.toFixed(1)}%
                            </p>
                            {includeLoanPayments && data.loanPayment > 0 && (
                              <p style={{ margin: 0, marginTop: '2px', color: '#f59e0b', fontSize: '11px' }}>
                                (includes loan payments)
                              </p>
                            )}
                            <p style={{ margin: 0, marginTop: '4px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                              {((data.savingRate / SAVINGS_RATE_GOAL) * 100).toFixed(0)}% of goal
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-text-light)" strokeDasharray="3 3" />
              {chartView === 'absolute' && (
                <ReferenceLine
                  y={SAVINGS_GOAL_CHF}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `Goal: ${new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(SAVINGS_GOAL_CHF)}`,
                    position: 'insideTopLeft',
                    fill: '#f59e0b',
                    fontSize: 12,
                    fontWeight: 600,
                    offset: 10
                  }}
                />
              )}
              {chartView === 'absolute' ? (
                <Bar dataKey="savings" radius={[8, 8, 0, 0]} name="Savings">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savings / SAVINGS_GOAL_CHF) * 100;
                    return <Cell key={`cell-${index}`} fill={getColorForPercentage(percentage)} />;
                  })}
                </Bar>
              ) : (
                <Bar dataKey="savingRate" radius={[8, 8, 0, 0]} name="Savings Rate (%)">
                  {filteredData.map((entry, index) => {
                    const percentage = (entry.savingRate / SAVINGS_RATE_GOAL) * 100;
                    return <Cell key={`cell-${index}`} fill={getColorForPercentage(percentage)} />;
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drilldown Details */}
      {selectedMonth && (
        <div id="drilldown-details" style={{ position: 'relative', scrollMarginTop: '100px' }}>
          <button
            className="drilldown-close"
            onClick={() => onSelectMonth(null)}
            title="Close details"
          >
            ✕
          </button>
          <MonthDetail
            month={selectedMonth}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            categorySorts={categorySorts}
            toggleSort={toggleSort}
            getSortedTransactions={getSortedTransactions}
            formatCurrency={formatCurrency}
            formatMonth={formatMonth}
            formatDate={formatDate}
            handleCategoryEdit={handleCategoryEdit}
            pendingCategoryChange={pendingCategoryChange}
            showEssentialSplit={showEssentialSplit}
            essentialCategories={essentialCategories}
            categoryEditModal={categoryEditModal}
            includeLoanPayments={includeLoanPayments}
            handlePredictionClick={handlePredictionClick}
            handleDismissPrediction={handleDismissPrediction}
            setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
            defaultCurrency={defaultCurrency}
            getTransactionKey={getTransactionKey}
            allMonthsData={summary}
          />
        </div>
      )}
    </div>
  );
};

export default ChartsPage;

