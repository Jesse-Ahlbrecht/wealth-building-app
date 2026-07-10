import React from 'react';

const DateRangeToggle = ({
  timeRange,
  selectedRange,
  showCustomHelp,
  customButtonRef,
  onTimeRangeChange,
  onCustomClick
}) => (
  <div className="time-range-selector">
    <button
      className={`time-range-btn ${timeRange === '3m' ? 'active' : ''}`}
      onClick={() => onTimeRangeChange('3m')}
    >
      3M
    </button>
    <button
      className={`time-range-btn ${timeRange === '6m' ? 'active' : ''}`}
      onClick={() => onTimeRangeChange('6m')}
    >
      6M
    </button>
    <button
      className={`time-range-btn ${timeRange === '1y' ? 'active' : ''}`}
      onClick={() => onTimeRangeChange('1y')}
    >
      1Y
    </button>
    <button
      className={`time-range-btn ${timeRange === 'all' ? 'active' : ''}`}
      onClick={() => onTimeRangeChange('all')}
    >
      All
    </button>
    <div className="custom-range-wrapper">
      <button
        ref={customButtonRef}
        className={`time-range-btn ${timeRange === 'custom' || selectedRange !== null ? 'active' : ''}`}
        onClick={onCustomClick}
        title={selectedRange ? 'Custom range selected' : 'Click to learn how to select a custom range'}
      >
        Custom
      </button>
      {showCustomHelp && customButtonRef?.current && (
        <div className="custom-range-help">
          <div className="custom-range-help-title">
            Custom Range Selection
          </div>
          <div className="custom-range-help-text">
            Click and drag across bars to select a date range
          </div>
          <div className="custom-range-help-tip">
            Tip: Start from any bar or empty space
          </div>
          <div className="custom-range-help-arrow" />
          <div className="custom-range-help-arrow-border" />
        </div>
      )}
    </div>
  </div>
);

export default DateRangeToggle;
