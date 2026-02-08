import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

import { useAppContext } from '../context/AppContext';

const WealthProjectionCalculator = ({ projectionData, formatCurrency }) => {
  const { preferences, updatePreferences } = useAppContext();

  // Initialize state from preferences or defaults
  const [timeframe, setTimeframe] = useState(10); // years
  const [interestRate, setInterestRate] = useState(5.0); // annual interest rate %
  const [customMonthlySavings, setCustomMonthlySavings] = useState(null); // null = use actual savings

  React.useEffect(() => {
    if (preferences) {
      if (preferences.projection_timeframe !== undefined) {
        setTimeframe(preferences.projection_timeframe);
      }
      if (preferences.projection_interestRate !== undefined) {
        setInterestRate(preferences.projection_interestRate);
      }
      if (preferences.projection_customMonthlySavings !== undefined) {
        setCustomMonthlySavings(preferences.projection_customMonthlySavings);
      }
    }
  }, [preferences]);

  const handleTimeframeChange = (value) => {
    setTimeframe(value);
    updatePreferences({ projection_timeframe: value });
  };

  const handleInterestRateChange = (value) => {
    setInterestRate(value);
    updatePreferences({ projection_interestRate: value });
  };

  const handleCustomMonthlySavingsChange = (value) => {
    setCustomMonthlySavings(value);
    updatePreferences({ projection_customMonthlySavings: value });
  };

  // Calculate projections
  const calculateProjections = () => {
    const annualInterestRate = interestRate / 100;
    const monthlyInterestRate = annualInterestRate / 12;
    const months = timeframe * 12;

    // Use custom monthly savings if set, otherwise use actual average
    const monthlySavings =
      customMonthlySavings !== null ? customMonthlySavings : projectionData.averageMonthlySavings;

    const projections = [];
    let currentNetWorth = projectionData.currentNetWorth;

    // Start from current month
    for (let month = 0; month <= months; month++) {
      const year = Math.floor(month / 12);

      projections.push({
        year,
        month,
        netWorth: currentNetWorth,
        savings: month > 0 ? monthlySavings : 0,
        interest: month > 0 ? currentNetWorth * monthlyInterestRate : 0
      });

      // Apply compound interest and monthly savings for next iteration
      if (month < months) {
        currentNetWorth = currentNetWorth * (1 + monthlyInterestRate) + monthlySavings;
      }
    }

    return projections;
  };

  const projections = calculateProjections();
  const finalProjection = projections[projections.length - 1];
  const totalSaved = projections.reduce((sum, p) => sum + p.savings, 0);
  const totalInterest = finalProjection.netWorth - projectionData.currentNetWorth - totalSaved;

  // Chart data - show yearly projections
  const chartData = [];
  const currentYear = new Date().getFullYear();

  for (let year = 0; year <= timeframe; year++) {
    const yearProjection = projections.find((p) => p.year === year);
    if (yearProjection) {
      const actualYear = currentYear + year;
      chartData.push({
        year,
        netWorth: yearProjection.netWorth,
        yearLabel: year === 0 ? 'Now' : actualYear.toString()
      });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => handleTimeframeChange(parseInt(e.target.value, 10))}
            style={{ padding: '8px 12px', border: '1px solid var(--color-border-primary)', borderRadius: '6px', fontSize: '14px', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          >
            <option value={5}>5 years</option>
            <option value={10}>10 years</option>
            <option value={20}>20 years</option>
            <option value={30}>30 years</option>
            <option value={40}>40 years</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
            Annual Interest Rate (%)
          </label>
          <input
            type="number"
            value={interestRate}
            onChange={(e) => handleInterestRateChange(parseFloat(e.target.value))}
            min="0"
            max="20"
            step="0.1"
            style={{
              padding: '8px 12px',
              border: '1px solid var(--color-border-primary)',
              borderRadius: '6px',
              fontSize: '14px',
              width: '100px',
              background: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
            Monthly Savings (CHF)
          </label>
          <input
            type="number"
            value={customMonthlySavings ?? projectionData.averageMonthlySavings}
            onChange={(e) => handleCustomMonthlySavingsChange(parseFloat(e.target.value))}
            min="0"
            step="100"
            style={{
              padding: '8px 12px',
              border: '1px solid var(--color-border-primary)',
              borderRadius: '6px',
              fontSize: '14px',
              width: '150px',
              background: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)'
            }}
          />
          <button
            onClick={() => handleCustomMonthlySavingsChange(null)}
            className="projection-reset-button"
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              background: 'var(--color-bg-button-secondary)',
              border: '1px solid var(--color-border-primary)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
              transition: 'all 0.2s ease'
            }}
          >
            Use actual amount
          </button>
        </div>
      </div>

      {/* Results Summary */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div
          style={{
            background: 'var(--color-bg-bar-container)',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            minWidth: '200px'
          }}
        >
          <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Projected Net Worth</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
            {formatCurrency(finalProjection.netWorth, 'CHF')}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-bg-bar-container)',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            minWidth: '200px'
          }}
        >
          <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Total Saved</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-accent-secondary)' }}>
            {formatCurrency(totalSaved, 'CHF')}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-bg-bar-container)',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary)',
            minWidth: '200px'
          }}
        >
          <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Interest Earned</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
            {formatCurrency(totalInterest, 'CHF')}
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
            <XAxis dataKey="yearLabel" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }} />
            <YAxis
              tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value, 'CHF').replace(/\s/g, '')}
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
                      <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.yearLabel}</p>
                      <p style={{ margin: 0, color: '#22c55e' }}>
                        Net Worth: {formatCurrency(data.netWorth, 'CHF')}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="#22c55e"
              strokeWidth={3}
              name="Net Worth"
              dot={{ fill: '#22c55e', r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WealthProjectionCalculator;

