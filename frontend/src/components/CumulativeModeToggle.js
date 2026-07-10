import React from 'react';

const CumulativeModeToggle = ({ value, onChange }) => (
  <div className="time-range-selector">
    <button
      type="button"
      className={`time-range-btn ${value === 'cumulative' ? 'active' : ''}`}
      onClick={() => onChange('cumulative')}
    >
      Cumulative
    </button>
    <button
      type="button"
      className={`time-range-btn ${value === 'normal' ? 'active' : ''}`}
      onClick={() => onChange('normal')}
    >
      Normal
    </button>
  </div>
);

export default CumulativeModeToggle;
