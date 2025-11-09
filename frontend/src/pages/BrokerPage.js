import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { EUR_TO_CHF_RATE } from '../utils/finance';

const BrokerPage = ({ broker, formatCurrency, formatDate }) => {
  if (!broker) {
    return (
      <div className="accounts-container">
        <div className="loading">Loading broker data...</div>
      </div>
    );
  }

  // Prepare chart data for total portfolio value over time
  const portfolioChartData = [];
  let cumulativeInvestedCHF = 0;
  let cumulativeInvestedEUR = 0;

  // Get ING DiBa purchase date and total from holdings
  const ingDibaHoldings = broker.holdings.filter((h) => h.account === 'ING DiBa');
  const ingDibaPurchaseDate =
    ingDibaHoldings.length > 0 && ingDibaHoldings[0].purchase_date
      ? new Date(ingDibaHoldings[0].purchase_date)
      : null;
  const ingDibaTotalCost = broker.summary.ing_diba ? broker.summary.ing_diba.total_invested : 0;
  const ingDibaCurrentValue = broker.summary.ing_diba ? broker.summary.ing_diba.total_current_value : 0;

  // Sort transactions by date
  const sortedTransactions = [...broker.transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Start from ING DiBa purchase date if available
  if (ingDibaPurchaseDate) {
    // Day before ING DiBa purchase
    portfolioChartData.push({
      date: formatDate(new Date(ingDibaPurchaseDate.getTime() - 24 * 60 * 60 * 1000)),
      totalInvested: 0
    });

    // ING DiBa purchase date
    cumulativeInvestedEUR = ingDibaTotalCost;
    portfolioChartData.push({
      date: formatDate(ingDibaPurchaseDate),
      totalInvested: ingDibaTotalCost * EUR_TO_CHF_RATE
    });
  } else if (sortedTransactions.length > 0) {
    // Fallback to first transaction if no ING DiBa date
    const firstDate = new Date(sortedTransactions[0].date);
    portfolioChartData.push({
      date: formatDate(new Date(firstDate.getTime() - 24 * 60 * 60 * 1000)),
      totalInvested: 0
    });
  }

  // Build cumulative investment data from VIAC transactions
  sortedTransactions.forEach((transaction) => {
    if (transaction.currency === 'CHF') {
      cumulativeInvestedCHF += Math.abs(transaction.amount);
    } else if (transaction.currency === 'EUR') {
      cumulativeInvestedEUR += Math.abs(transaction.amount);
    }

    // Convert to CHF for total
    const totalInCHF = cumulativeInvestedCHF + cumulativeInvestedEUR * EUR_TO_CHF_RATE;

    portfolioChartData.push({
      date: formatDate(transaction.date),
      totalInvested: totalInCHF
    });
  });

  // Add current value as final point (today)
  const viacTotal = broker.summary.viac ? broker.summary.viac.total_invested : 0;
  const totalInvestedCHF = viacTotal + ingDibaTotalCost * EUR_TO_CHF_RATE;
  const totalCurrentValueInCHF = viacTotal + ingDibaCurrentValue * EUR_TO_CHF_RATE;

  portfolioChartData.push({
    date: formatDate(new Date()),
    totalInvested: totalInvestedCHF,
    currentValue: totalCurrentValueInCHF
  });

  return (
    <div className="accounts-container">
      <div className="accounts-summary">
        <h3 className="accounts-title">Broker Summary</h3>
        <div className="totals-grid">
          {broker.summary.viac && (
            <div className="total-card">
              <div className="total-label">VIAC</div>
              <div className="total-amount positive">
                {formatCurrency(broker.summary.viac.total_invested, broker.summary.viac.currency)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>Cost Basis</div>
            </div>
          )}
          {broker.summary.ing_diba && (
            <div className="total-card">
              <div className="total-label">ING DiBa</div>
              <div className="total-amount positive">
                {formatCurrency(broker.summary.ing_diba.total_current_value, broker.summary.ing_diba.currency)}
              </div>
              <div style={{ fontSize: '14px', marginTop: '4px', color: '#22c55e' }}>
                +
                {formatCurrency(
                  broker.summary.ing_diba.total_current_value - broker.summary.ing_diba.total_invested,
                  broker.summary.ing_diba.currency
                )}{' '}
                (
                {(
                  ((broker.summary.ing_diba.total_current_value - broker.summary.ing_diba.total_invested) /
                    broker.summary.ing_diba.total_invested) *
                  100
                ).toFixed(2)}
                %)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Value Over Time Chart */}
      <div className="charts-container" style={{ marginTop: '32px' }}>
        <div className="chart-section">
          <h3 className="chart-title">Portfolio Value Over Time</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={portfolioChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#666', fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fill: '#666', fontSize: 12 }}
                  tickFormatter={(value) => formatCurrency(value, 'CHF').replace(/\s/g, '')}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    padding: '12px'
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div
                          style={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e5e5',
                            borderRadius: '8px',
                            padding: '12px'
                          }}
                        >
                          <p style={{ margin: 0, marginBottom: '8px', fontWeight: 600 }}>{data.date}</p>
                          {data.totalInvested !== undefined && (
                            <p style={{ margin: 0, color: '#6366f1' }}>
                              Invested: {formatCurrency(data.totalInvested, 'CHF')}
                            </p>
                          )}
                          {data.currentValue !== undefined && (
                            <>
                              <p style={{ margin: 0, marginTop: '4px', color: '#22c55e' }}>
                                Current: {formatCurrency(data.currentValue, 'CHF')}
                              </p>
                              <p style={{ margin: 0, marginTop: '4px', color: '#f59e0b', fontSize: '12px' }}>
                                Gain: {formatCurrency(data.currentValue - data.totalInvested, 'CHF')} (
                                {(((data.currentValue - data.totalInvested) / data.totalInvested) * 100).toFixed(2)}%)
                              </p>
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend verticalAlign="top" height={36} />
                <Line
                  type="monotone"
                  dataKey="totalInvested"
                  stroke="#6366f1"
                  strokeWidth={3}
                  name="Total Invested (CHF)"
                  dot={{ fill: '#6366f1', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="currentValue"
                  stroke="#22c55e"
                  strokeWidth={3}
                  name="Current Value (CHF)"
                  dot={{ fill: '#22c55e', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ING DiBa Holdings */}
      {broker.holdings.filter((h) => h.account === 'ING DiBa').length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">ING DiBa Holdings</h3>
          <div className="accounts-grid">
            {broker.holdings
              .filter((h) => h.account === 'ING DiBa')
              .map((holding) => {
                const hasCurrentValue =
                  holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost) * 100 : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span
                        className={`account-badge account-badge-${holding.account
                          .toLowerCase()
                          .replace(/ /g, '-')}`}
                      >
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            marginTop: '4px',
                            color: profitLoss >= 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">{holding.shares} shares</span>
                      <span className="account-meta-item">
                        Avg: {formatCurrency(holding.average_cost, holding.currency)}
                      </span>
                    </div>
                    {hasCurrentValue && (
                      <div className="account-meta">
                        <span className="account-meta-item">
                          Cost: {formatCurrency(holding.total_cost, holding.currency)}
                        </span>
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '4px' }}>
                      <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                        ISIN: {holding.isin}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Säule 3a Holdings */}
      {broker.holdings.filter((h) => h.account === 'VIAC').length > 0 && (
        <div className="accounts-list-section">
          <h3 className="accounts-title">Säule 3a Holdings</h3>
          <div className="accounts-grid">
            {broker.holdings
              .filter((h) => h.account === 'VIAC')
              .map((holding) => {
                const hasCurrentValue =
                  holding.current_value !== null && holding.current_value !== undefined;
                const profitLoss = hasCurrentValue ? holding.current_value - holding.total_cost : 0;
                const profitLossPercent = hasCurrentValue ? (profitLoss / holding.total_cost) * 100 : 0;

                return (
                  <div key={`${holding.account}-${holding.isin}`} className="account-card">
                    <div className="account-header">
                      <div className="account-name">{holding.security}</div>
                      <span
                        className={`account-badge account-badge-${holding.account
                          .toLowerCase()
                          .replace(/ /g, '-')}`}
                      >
                        {holding.currency}
                      </span>
                    </div>
                    {hasCurrentValue ? (
                      <>
                        <div className="account-balance positive">
                          {formatCurrency(holding.current_value, holding.currency)}
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            marginTop: '4px',
                            color: profitLoss >= 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {profitLoss >= 0 ? '+' : ''}
                          {formatCurrency(profitLoss, holding.currency)} ({profitLossPercent.toFixed(2)}%)
                        </div>
                      </>
                    ) : (
                      <div className="account-balance positive">
                        {formatCurrency(holding.total_cost, holding.currency)}
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>
                      <span className="account-meta-item">{holding.shares} shares</span>
                      <span className="account-meta-item">
                        Avg: {formatCurrency(holding.average_cost, holding.currency)}
                      </span>
                    </div>
                    {hasCurrentValue && (
                      <div className="account-meta">
                        <span className="account-meta-item">
                          Cost: {formatCurrency(holding.total_cost, holding.currency)}
                        </span>
                      </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '4px' }}>
                      <span className="account-meta-item" style={{ fontSize: '11px', color: '#666' }}>
                        ISIN: {holding.isin}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="accounts-list-section">
        <h3 className="accounts-title">Transaction History</h3>
        <div className="transaction-list">
          {broker.transactions.map((transaction, idx) => (
            <div key={idx} className="transaction-item">
              <div className="transaction-date">
                {formatDate(transaction.date)}
                <span className="account-badge account-badge-viac">{transaction.type.toUpperCase()}</span>
              </div>
              <div className="transaction-details">
                <div className="transaction-recipient">{transaction.security}</div>
                <div className="transaction-description">
                  {transaction.shares} shares @ ${transaction.price_usd.toFixed(2)} USD
                </div>
                <div
                  className="transaction-description"
                  style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}
                >
                  ISIN: {transaction.isin}
                </div>
              </div>
              <div className="transaction-amount transaction-amount-income">
                {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrokerPage;

