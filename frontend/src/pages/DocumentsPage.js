import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { accountsAPI, documentsAPI, importsAPI } from '../api';
import { formatDate } from '../utils';
import { classifyImportFile, parseImportFile } from '../utils/importParsers';
import { useAppContext } from '../context/AppContext';
import { useIbkrDepositPairs } from '../hooks';

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const accountCoverageSummary = (account) => {
  const segments = account.segments || [];
  if (segments.length === 0) {
    return { rangeLabel: 'No coverage yet', gapCount: 0 };
  }
  const overallStart = segments.reduce((min, segment) => (segment.startDate < min ? segment.startDate : min), segments[0].startDate);
  const overallEnd = segments.reduce((max, segment) => (segment.endDate > max ? segment.endDate : max), segments[0].endDate);
  return {
    rangeLabel: `${formatDate(overallStart)} – ${formatDate(overallEnd)}`,
    gapCount: account.gaps?.length || 0
  };
};

const DocumentsPage = () => {
  const { loadBroker } = useAppContext();
  const { reloadIbkrDepositPairs } = useIbkrDepositPairs();
  const [overview, setOverview] = useState({ accounts: [] });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [accountPendingDeletion, setAccountPendingDeletion] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await importsAPI.getOverview();
      setOverview(response?.data || response || { accounts: [] });
    } catch (loadError) {
      console.error('Failed to load imports overview:', loadError);
      setError(loadError.message || 'Failed to load import coverage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(timer);
  }, [result]);

  const importFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const allBatches = [];
      const brokerUploads = [];
      const issues = [];

      for (const file of files) {
        try {
          const classification = await classifyImportFile(file);
          if (classification.kind === 'broker') {
            await documentsAPI.uploadDocument(file, classification.documentType);
            brokerUploads.push({ name: file.name, documentType: classification.documentType });
          } else {
            const parsedBatches = await parseImportFile(file);
            allBatches.push(...parsedBatches);
          }
        } catch (fileError) {
          issues.push(`${file.name}: ${fileError.message}`);
        }
      }

      if (allBatches.length === 0 && brokerUploads.length === 0) {
        throw new Error(issues[0] || 'No supported imports found');
      }

      let importedBatches = [];
      if (allBatches.length > 0) {
        const response = await importsAPI.importBatches(allBatches);
        importedBatches = response?.data?.batches || response?.batches || [];
      }

      await loadOverview();
      if (brokerUploads.length > 0) {
        await loadBroker({ force: true });
        await reloadIbkrDepositPairs();
      }
      setResult({
        importedBatches,
        brokerUploads,
        issues
      });
    } catch (uploadError) {
      console.error('Failed to import files:', uploadError);
      setError(uploadError.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  }, [loadOverview, loadBroker, reloadIbkrDepositPairs]);

  const handleFileInputChange = useCallback((event) => {
    importFiles(event.target.files);
    event.target.value = '';
  }, [importFiles]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    if (!uploading) importFiles(event.dataTransfer.files);
  }, [importFiles, uploading]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    if (!uploading) setDragActive(true);
  }, [uploading]);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  const startEditingAccount = useCallback((account) => {
    setEditingAccountId(account.id);
    setEditingName(account.accountName);
  }, []);

  const cancelEditingAccount = useCallback(() => {
    setEditingAccountId(null);
    setEditingName('');
  }, []);

  const saveAccountName = useCallback(async () => {
    const name = editingName.trim();
    if (!name || !editingAccountId) {
      cancelEditingAccount();
      return;
    }

    setRenaming(true);
    try {
      await accountsAPI.renameAccount(editingAccountId, name);
      await loadOverview();
      cancelEditingAccount();
    } catch (renameError) {
      console.error('Failed to rename account:', renameError);
      setError(renameError.message || 'Failed to rename account');
    } finally {
      setRenaming(false);
    }
  }, [editingAccountId, editingName, loadOverview, cancelEditingAccount]);

  const confirmDeleteAccount = useCallback(async () => {
    const account = accountPendingDeletion;
    if (!account) return;

    setDeletingAccount(true);
    try {
      await accountsAPI.deleteAccount(account.id);
      await loadOverview();
      setAccountPendingDeletion(null);
    } catch (deleteError) {
      console.error('Failed to delete account:', deleteError);
      setError(deleteError.message || 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  }, [accountPendingDeletion, loadOverview]);

  const accountsWithCoverage = useMemo(
    () => (overview?.accounts || []).slice().sort((left, right) => left.accountName.localeCompare(right.accountName)),
    [overview]
  );

  return (
    <div className="documents-page imports-page">
      <section className="imports-hero">
        <div>
          <h3>Imports</h3>
          <p>DKB, YUH, Swisscard, Amazon Visa, and Interactive Brokers Flex CSVs are parsed locally in your browser.</p>
        </div>
        <label
          className={`imports-dropzone ${uploading ? 'disabled' : ''} ${dragActive ? 'active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            onChange={handleFileInputChange}
            disabled={uploading}
          />
          <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
          <span>{uploading ? 'Importing…' : 'Drop statements here or click to browse'}</span>
        </label>
      </section>

      {error && <div className="documents-loading">{error}</div>}

      {result && (
        <section className="imports-result-banner">
          {result.importedBatches.map((batch) => (
            <span key={`${batch.accountName}-${batch.statementStartDate}-${batch.statementEndDate}`}>
              {batch.accountName}: {batch.importedCount} imported, {batch.skippedCount} skipped
            </span>
          ))}
          {result.brokerUploads?.map((upload) => (
            <span key={upload.name}>{upload.name}: broker document uploaded</span>
          ))}
          {result.issues?.map((issue) => (
            <span key={issue} className="imports-result-issue">{issue}</span>
          ))}
        </section>
      )}

      <section className="imports-accounts-section">
        <h3>Accounts</h3>

        {loading ? (
          <div className="documents-loading">Loading accounts…</div>
        ) : accountsWithCoverage.length === 0 ? (
          <div className="documents-empty-state">No accounts yet. Import a statement to create your first account.</div>
        ) : (
          <div className="imports-account-list">
            {accountsWithCoverage.map((account) => {
              const summary = accountCoverageSummary(account);
              return (
                <div key={account.accountName} className="imports-account-row">
                  <div className="imports-account-row-name">
                    {editingAccountId === account.id ? (
                      <input
                        type="text"
                        className="imports-account-name-input"
                        value={editingName}
                        autoFocus
                        disabled={renaming}
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={saveAccountName}
                        onKeyDown={(event) => {
                          // Enter triggers blur, which saves via onBlur above.
                          if (event.key === 'Enter') event.target.blur();
                          if (event.key === 'Escape') cancelEditingAccount();
                        }}
                      />
                    ) : (
                      <strong
                        className="imports-account-name-editable"
                        onClick={() => startEditingAccount(account)}
                        title="Click to rename"
                      >
                        {account.accountName}
                      </strong>
                    )}
                    <span>{account.currency} · {account.accountType}</span>
                  </div>
                  <div className="imports-account-row-coverage">
                    <span>{summary.rangeLabel}</span>
                    {summary.gapCount > 0 && (
                      <span className="imports-gap-warning">
                        ⚠ {summary.gapCount} gap{summary.gapCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="imports-account-row-meta">
                    <span>{account.totalTransactions || 0} transactions</span>
                    <span>Last import: {account.lastImportAt ? formatDateTime(account.lastImportAt) : '—'}</span>
                  </div>
                  <button
                    type="button"
                    className="imports-account-delete-button"
                    title="Delete account"
                    onClick={() => setAccountPendingDeletion(account)}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {accountPendingDeletion && (
        <div className="modal-overlay open" onClick={() => setAccountPendingDeletion(null)}>
          <div className="modal-content open" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete account</h3>
              <button type="button" className="modal-close" onClick={() => setAccountPendingDeletion(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>
                Permanently delete <strong>{accountPendingDeletion.accountName}</strong> and its{' '}
                {accountPendingDeletion.totalTransactions || 0} transactions? This cannot be undone.
              </p>
              <div className="prediction-edit-actions">
                <button
                  type="button"
                  className="document-delete-button"
                  onClick={confirmDeleteAccount}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? 'Deleting…' : 'Delete permanently'}
                </button>
                <div className="prediction-edit-actions-right">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAccountPendingDeletion(null)}
                    disabled={deletingAccount}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
