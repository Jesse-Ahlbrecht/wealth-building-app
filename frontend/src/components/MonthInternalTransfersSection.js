import React, { useMemo } from 'react';
import { isIbkrBankTransfer } from '../utils/ibkrDepositPairHelpers';
import { sortTransactions } from '../utils/transactionSortHelpers';
import { IbkrDepositPairRow, InternalTransferPairRow } from './TransferPairGroup';

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
          {ibkrDepositPairsInMonth.map((pair) => (
            <IbkrDepositPairRow
              key={pair.id}
              pair={pair}
              monthKey={monthKey}
              defaultCurrency={defaultCurrency}
              expandedPairs={expandedPairs}
              onTogglePair={onTogglePair}
              renderTransactionItem={renderTransactionItem}
            />
          ))}
        </div>
      )}
      {hasTransferPairs ? (
        <div className="transfer-pair-list">
          {transferPairsInMonth.map((pair) => (
            <InternalTransferPairRow
              key={pair.id}
              pair={pair}
              monthKey={monthKey}
              defaultCurrency={defaultCurrency}
              expandedPairs={expandedPairs}
              onTogglePair={onTogglePair}
              renderTransactionItem={renderTransactionItem}
            />
          ))}
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
