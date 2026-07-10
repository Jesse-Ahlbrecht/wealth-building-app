import React from 'react';

const SegmentedControl = ({
  value,
  onChange,
  options,
  className = 'time-range-selector',
  buttonClassName = 'time-range-btn',
  ariaLabel
}) => (
  <div className={className} role="tablist" aria-label={ariaLabel}>
    {options.map((option) => {
      const isActive = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={`${buttonClassName}${isActive ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
          title={option.title}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
