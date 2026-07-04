import React from 'react';

const ChartPageStates = ({
  loading,
  error,
  isEmpty,
  onRetry,
  loadingMessage = 'Loading...',
  errorMessage,
  emptyTitle = 'No Data Available',
  emptyMessage = 'Upload bank statements to see your data here.',
  containerClassName = 'charts-container',
  children
}) => {
  if (loading) {
    return (
      <div className={containerClassName}>
        <div className="loading">{loadingMessage}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClassName}>
        <div className="error-message">
          {errorMessage || error}
          {onRetry && (
            <button onClick={onRetry} className="btn-secondary" style={{ marginTop: '16px' }}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={containerClassName}>
        <div className="empty-state">
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ChartPageStates;
