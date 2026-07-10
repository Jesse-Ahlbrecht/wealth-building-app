import React from 'react';

const ValueModeToggle = ({ value, onChange }) => (
  <div className="time-range-selector">
    <button
      type="button"
      className={`time-range-btn ${value === 'absolute' ? 'active' : ''}`}
      onClick={() => onChange('absolute')}
    >
      Absolute
    </button>
    <button
      type="button"
      className={`time-range-btn ${value === 'percentage' ? 'active' : ''}`}
      onClick={() => onChange('percentage')}
    >
      Percentage
    </button>
  </div>
);

export default ValueModeToggle;
