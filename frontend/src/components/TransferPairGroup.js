import React from 'react';
import { formatCurrency } from '../utils';
import { ibkrDepositToTransaction, normalizeIbkrBankLeg } from '../utils/ibkrDepositPairHelpers';
import TransactionListItem from './TransactionListItem';

const dayDiffLabel = (dayDiff) =>
  dayDiff > 0 ? `${dayDiff} day${dayDiff === 1 ? '' : 's'} apart` : 'Same day';

const TransferPairGroup = ({
  pairKey,
  isExpanded,
  onToggle,
  label,
  dayDiff,
  amount,
  currency,
  defaultCurrency,
  children
}) => (
  <div className="transfer-pair-group">
    <button
      type="button"
      className="transfer-pair-header"
      onClick={() => onToggle(pairKey)}
    >
      <span className="transfer-pair-header-main">
        <span className="expand-arrow">{isExpanded ? '▼' : '▶'}</span>
        <span>{label}</span>
        <span className="transfer-pair-meta">{dayDiffLabel(dayDiff)}</span>
      </span>
      <span className="transfer-pair-amount">
        {formatCurrency(Math.abs(amount), currency || defaultCurrency)}
      </span>
    </button>
    {isExpanded && (
      <div className="transfer-pair-legs">
        {children}
      </div>
    )}
  </div>
);

export const IbkrDepositPairRow = ({
  pair,
  monthKey,
  defaultCurrency,
  expandedPairs,
  onTogglePair,
  renderTransactionItem
}) => {
  const pairKey = `${monthKey}-ibkr-pair-${pair.id}`;

  return (
    <TransferPairGroup
      pairKey={pairKey}
      isExpanded={expandedPairs[pairKey]}
      onToggle={onTogglePair}
      label={`${pair.bank.account} → Interactive Brokers`}
      dayDiff={pair.dayDiff}
      amount={pair.amount}
      currency={pair.currency}
      defaultCurrency={defaultCurrency}
    >
      {renderTransactionItem(normalizeIbkrBankLeg(pair.bank), `ibkr-bank-${pair.id}`)}
      <TransactionListItem
        txn={ibkrDepositToTransaction(pair.deposit, defaultCurrency)}
        idx={`ibkr-deposit-${pair.id}`}
        defaultCurrency={defaultCurrency}
      />
    </TransferPairGroup>
  );
};

export const InternalTransferPairRow = ({
  pair,
  monthKey,
  defaultCurrency,
  expandedPairs,
  onTogglePair,
  renderTransactionItem
}) => {
  const pairKey = `${monthKey}-pair-${pair.id}`;

  return (
    <TransferPairGroup
      pairKey={pairKey}
      isExpanded={expandedPairs[pairKey]}
      onToggle={onTogglePair}
      label={`${pair.outflow.account} → ${pair.inflow.account}`}
      dayDiff={pair.dayDiff}
      amount={pair.amount}
      currency={pair.currency}
      defaultCurrency={defaultCurrency}
    >
      {renderTransactionItem(pair.outflow, `out-${pair.id}`)}
      {renderTransactionItem(pair.inflow, `in-${pair.id}`)}
    </TransferPairGroup>
  );
};

export default TransferPairGroup;
