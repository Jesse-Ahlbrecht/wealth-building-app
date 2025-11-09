import React from 'react';

const MonthlyOverviewPage = ({
  summary,
  categoriesVersion,
  expandedCategories,
  toggleCategory,
  categorySorts,
  toggleSort,
  getSortedTransactions,
  formatCurrency,
  formatMonth,
  formatDate,
  handleCategoryEdit,
  pendingCategoryChange,
  showEssentialSplit,
  onToggleEssentialSplit,
  includeLoanPayments,
  onToggleIncludeLoanPayments,
  essentialCategories,
  categoryEditModal,
  handlePredictionClick,
  handleDismissPrediction,
  setShowEssentialCategoriesModal,
  defaultCurrency,
  getTransactionKey,
  MonthDetailComponent
}) => {
  if (!summary.length) {
    return (
      <div className="current-month-container">
        <div className="loading">No transaction data available.</div>
      </div>
    );
  }

  // Get latest month (current month) and all previous months
  const sortedMonths = [...summary].sort((a, b) => new Date(b.month) - new Date(a.month));
  const latestMonth = sortedMonths[0];
  const previousMonths = sortedMonths.slice(1);

  if (!latestMonth) {
    return (
      <div className="current-month-container">
        <div className="loading">Unable to determine the current month summary.</div>
      </div>
    );
  }

  const MonthDetail = MonthDetailComponent;

  return (
    <>
      {/* Controls at the top */}
      <div className="details-controls">
        <div className="chart-toggle">
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? '' : 'active'}`}
            onClick={() => onToggleEssentialSplit(false)}
          >
            All Categories
          </button>
          <button
            className={`chart-toggle-btn ${showEssentialSplit ? 'active' : ''}`}
            onClick={() => onToggleEssentialSplit(true)}
          >
            Essentials Split
          </button>
        </div>
        <div className="loan-payment-toggle">
          <button
            className={`chart-toggle-btn ${includeLoanPayments ? 'active' : ''}`}
            onClick={onToggleIncludeLoanPayments}
            title="Include monthly loan payments in savings calculation"
          >
            Include loans in saving
          </button>
        </div>
      </div>

      {/* Current Month with Predictions */}
      <div style={{ marginTop: '0' }}>
        <MonthDetail
          key={`${latestMonth.month}-${categoriesVersion}`}
          month={latestMonth}
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
          handlePredictionClick={handlePredictionClick}
          handleDismissPrediction={handleDismissPrediction}
          includeLoanPayments={includeLoanPayments}
          setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
          defaultCurrency={defaultCurrency}
          getTransactionKey={getTransactionKey}
          isCurrentMonth={true}
          allMonthsData={summary}
        />
      </div>

      {/* Previous Months - details style */}
      {previousMonths.length > 0 && (
        <>
          <div
            style={{
              padding: '2rem 0 1rem',
              borderTop: '2px solid #e5e7eb',
              marginTop: '2rem'
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem'
              }}
            >
              Previous Months
            </h3>
          </div>
          {previousMonths.map((month) => (
            <MonthDetail
              key={`${month.month}-${categoriesVersion}`}
              month={month}
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
              handlePredictionClick={handlePredictionClick}
              handleDismissPrediction={handleDismissPrediction}
              includeLoanPayments={includeLoanPayments}
              setShowEssentialCategoriesModal={setShowEssentialCategoriesModal}
              defaultCurrency={defaultCurrency}
              getTransactionKey={getTransactionKey}
              allMonthsData={summary}
            />
          ))}
        </>
      )}
    </>
  );
};

export default MonthlyOverviewPage;

