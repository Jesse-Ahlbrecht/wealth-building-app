import React from 'react';
import { COCKPIT_VIEW_OPTIONS } from '../utils/cockpitChartConfig';

const CockpitViewToggle = ({ value, onChange }) => (
  <div className="cockpit-view-toggle" role="tablist" aria-label="Chart view">
    {COCKPIT_VIEW_OPTIONS.map((option) => {
      const isActive = value === option.key;
      return (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={`cockpit-view-toggle__btn${isActive ? ' active' : ''}`}
          style={isActive ? { '--view-accent': option.color } : undefined}
          onClick={() => onChange(option.key)}
          title={option.title}
        >
          <span className="cockpit-view-toggle__dot" aria-hidden="true" />
          {option.label}
        </button>
      );
    })}
  </div>
);

export default CockpitViewToggle;
