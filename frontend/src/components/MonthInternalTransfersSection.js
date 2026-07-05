import React, { useMemo } from 'react';
import { formatCurrency, formatDate } from '../utils';
import { BROKER_SAVINGS_CASH } from '../utils/categoryHelpers';
import { isIbkrBankTransfer } from '../utils/ibkrDepositPairHelpers';
import { sortTransactions } from '../utils/transactionSortHelpers';
import TransferPairGroup from './TransferPairGroup';

const IbkrDepositLeg = ({ deposit, defaultCurrency }) => (
  <div className="transaction-item">
    <div className="transaction-date">
      {formatDate(deposit.date)}
      <span className="account-badge account-badge-interactive-brokers" style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px' }}>
        IBKR
      </span>
    </div>
    <div className="transaction-details">
      <div className="transaction-recipient">{deposit.security || 'Deposit'}</div>
      <div className="transaction-description" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
        {BROKER_SAVINGS_CASH}
      </div>
    </div>
    <div className="transaction-amount">
      {formatCurrency(Math.abs(deposit.amount), deposit.currency || defaultCurrency)}
    </div>
  </div>
);

const MonthInternalTransfersSection = ({
  monthKey,
  defaultCurrency,
  internalTransferTransactions,
  monthPairs,
  sortConfig,
  expandedPairs,
  onTogglePair,
  renderTransactionItem
}) => {
  const {
    transferPairsInMonth,
    ibkrDepositPairsInMonth,
    ibkrMatchByBankHash,
    unpairedInternalTransfers,
    unpairedIbkrBankTransfers
  } = monthPairs;

  const hasTransferPairs = transferPairsInMonth.length > 0;

  const sortedLists = useMemo(() => {
    const sortedUnpaired = sortTransactions(unpairedInternalTransfers, 'expense', sortConfig);
    return {
      flat: sortTransactions(
        internalTransferTransactions.filter((txn) => !ibkrMatchByBankHash.has(txn?.transaction_hash)),
        'expense',
        sortConfig
      ),
      nonIbkrUnpaired: sortedUnpaired.filter((txn) => !isIbkrBankTransfer(txn)),
      ibkrUnpaired: sortTransactions(unpairedIbkrBankTransfers, 'expense', sortConfig)
    };
  }, [
    unpairedInternalTransfers,
    unpairedIbkrBankTransfers,
    internalTransferTransactions,
    ibkrMatchByBankHash,
    sortConfig
  ]);

  return (
    <>
      {ibkrDepositPairsInMonth.length > 0 && (
        <div className="transfer-pair-list" style={{ marginBottom: '12px' }}>
          <div className="transfer-pair-unmatched-title">IBKR deposits</div>
          {ibkrDepositPairsInMonth.map((pair) => {
            const pairKey = `${monthKey}-ibkr-pair-${pair.id}`;
            const bankTxn = {
              ...pair.bank,
              amount: -Math.abs(pair.bank.amount),
              type: pair.bank.type || 'expense'
            };
            return (
              <TransferPairGroup
                key={pair.id}
                pairKey={pairKey}
                isExpanded={expandedPairs[pairKey]}
                onToggle={onTogglePair}
                label={`${pair.bank.account} → Interactive Brokers`}
                dayDiff={pair.dayDiff}
                amount={pair.amount}
                currency={pair.currency}
                defaultCurrency={defaultCurrency}
              >
                {renderTransactionItem(bankTxn, `ibkr-bank-${pair.id}`)}
                <IbkrDepositLeg deposit={pair.deposit} defaultCurrency={defaultCurrency} />
              </TransferPairGroup>
            );
          })}
        </div>
      )}
      {hasTransferPairs ? (
        <div className="transfer-pair-list">
          {transferPairsInMonth.map((pair) => {
            const pairKey = `${monthKey}-pair-${pair.id}`;
            return (
              <TransferPairGroup
                key={pair.id}
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
          })}
        </div>
      ) : (
        <div className="transaction-list">
          {sortedLists.flat.map((txn, idx) => renderTransactionItem(txn, idx))}
        </div>
      )}
      {hasTransferPairs && sortedLists.nonIbkrUnpaired.length > 0 && (
        <div className="transfer-pair-unmatched">
          <div className="transfer-pair-unmatched-title">Unmatched</div>
          <div className="transaction-list">
            {sortedLists.nonIbkrUnpaired.map((txn, idx) => renderTransactionItem(txn, `unpaired-${idx}`))}
          </div>
        </div>
      )}
      {sortedLists.ibkrUnpaired.length > 0 && (
        <div className="transfer-pair-unmatched">
          <div className="transfer-pair-unmatched-title">Unmatched IBKR transfers</div>
          <div className="transaction-list">
            {sortedLists.ibkrUnpaired.map((txn, idx) => renderTransactionItem(txn, `ibkr-unpaired-${idx}`))}
          </div>
        </div>
      )}
    </>
  );
};

export default MonthInternalTransfersSection;
