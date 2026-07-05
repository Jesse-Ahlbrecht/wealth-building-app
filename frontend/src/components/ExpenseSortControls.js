import React from 'react';

const ExpenseSortControls = ({ sortField, sortDirection, onSortToggle }) => {
  const getSortArrow = (field) => {
    if (sortField !== field) return '▲▼';
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="transaction-sort-row" role="group" aria-label="Sort expense transactions">
      <button
        className={`transaction-sort-btn ${sortField === 'date' ? 'active' : ''}`}
        onClick={() => onSortToggle('date')}
      >
        Date
        <span className="transaction-sort-arrow">{getSortArrow('date')}</span>
      </button>
      <button
        className={`transaction-sort-btn ${sortField === 'recipient' ? 'active' : ''}`}
        onClick={() => onSortToggle('recipient')}
      >
        Recipient
        <span className="transaction-sort-arrow">{getSortArrow('recipient')}</span>
      </button>
      <button
        className={`transaction-sort-btn transaction-sort-btn-amount ${sortField === 'amount' ? 'active' : ''}`}
        onClick={() => onSortToggle('amount')}
      >
        Amount
        <span className="transaction-sort-arrow">{getSortArrow('amount')}</span>
      </button>
    </div>
  );
};

export default ExpenseSortControls;
