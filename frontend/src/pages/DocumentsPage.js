import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsAPI, importsAPI } from '../api';
import { formatDate } from '../utils';
import { classifyImportFile, parseImportFile } from '../utils/importParsers';

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const daysBetween = (start, end) => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
};

const TimelineBar = ({ segments }) => {
  if (!segments || segments.length === 0) {
    return <div className="import-timeline-empty">No imported coverage yet.</div>;
  }

  const overallStart = segments.reduce((min, segment) => (segment.startDate < min ? segment.startDate : min), segments[0].startDate);
  const overallEnd = segments.reduce((max, segment) => (segment.endDate > max ? segment.endDate : max), segments[0].endDate);
  const totalDays = daysBetween(overallStart, overallEnd);

  return (
    <div className="import-timeline">
      <div className="import-timeline-track">
        {segments.map((segment) => {
          const left = ((daysBetween(overallStart, segment.startDate) - 1) / totalDays) * 100;
          const width = (daysBetween(segment.startDate, segment.endDate) / totalDays) * 100;
          return (
            <div
              key={`${segment.startDate}-${segment.endDate}`}
              className="import-timeline-segment"
              style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
              title={`${formatDate(segment.startDate)} to ${formatDate(segment.endDate)}`}
            />
          );
        })}
      </div>
      <div className="import-timeline-labels">
        <span>{formatDate(overallStart)}</span>
        <span>{formatDate(overallEnd)}</span>
      </div>
    </div>
  );
};

const DocumentsPage = () => {
  const [overview, setOverview] = useState({ accounts: [], recentImports: [] });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await importsAPI.getOverview();
      setOverview(response?.data || response || { accounts: [], recentImports: [] });
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

  const handleFilesSelected = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
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
      event.target.value = '';
    }
  }, [loadOverview]);

  const accountsWithCoverage = useMemo(
    () => (overview?.accounts || []).slice().sort((left, right) => left.accountName.localeCompare(right.accountName)),
    [overview]
  );

  return (
    <div className="documents-page imports-page">
      <section className="imports-hero">
        <div>
          <h3>Imports</h3>
          <p>
            Import statement files locally in the browser, upload normalized transactions,
            and track coverage by account instead of managing raw files.
          </p>
        </div>
        <label className={`imports-upload-button ${uploading ? 'disabled' : ''}`}>
          <input
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            onChange={handleFilesSelected}
            disabled={uploading}
          />
          {uploading ? 'Importing…' : 'Import statements'}
        </label>
      </section>

      <section className="imports-upload-card">
        <div>
          <h4>Supported imports</h4>
          <p>DKB, YUH, Swisscard CSV exports, Amazon Visa Excel exports, and Interactive Brokers Activity Flex CSVs. Bank files are parsed client-side; broker files are stored encrypted and processed on the Broker page.</p>
        </div>
        <button type="button" className="documents-refresh-button" onClick={loadOverview} disabled={loading || uploading}>
          {loading ? 'Refreshing…' : 'Refresh overview'}
        </button>
      </section>

      {error && <div className="documents-loading">{error}</div>}

      {result && (
        <section className="imports-result-card">
          <h4>Last import</h4>
          <ul>
            {result.importedBatches.map((batch) => (
              <li key={`${batch.accountName}-${batch.statementStartDate}-${batch.statementEndDate}`}>
                {batch.accountName}: {batch.importedCount} imported, {batch.skippedCount} skipped
                ({formatDate(batch.statementStartDate)} to {formatDate(batch.statementEndDate)})
              </li>
            ))}
            {result.brokerUploads?.map((upload) => (
              <li key={upload.name}>
                {upload.name}: broker document uploaded ({upload.documentType})
              </li>
            ))}
          </ul>
          {result.issues?.length > 0 && (
            <div className="imports-issues">
              {result.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="imports-coverage-section">
        <div className="documents-toolbar">
          <div>
            <h3>Coverage by Account</h3>
            <p>Each account shows covered statement ranges and any missing gaps between imported periods.</p>
          </div>
        </div>

        {loading ? (
          <div className="documents-loading">Loading import coverage…</div>
        ) : accountsWithCoverage.length === 0 ? (
          <div className="documents-empty-state">No accounts yet. Import a statement to create your first account timeline.</div>
        ) : (
          <div className="imports-coverage-grid">
            {accountsWithCoverage.map((account) => (
              <article key={account.accountName} className="imports-account-card">
                <div className="imports-account-header">
                  <div>
                    <h4>{account.accountName}</h4>
                    <p>{account.currency} · {account.accountType}</p>
                  </div>
                  <div className="imports-account-meta">
                    <span>{account.totalTransactions || 0} tx</span>
                    <span>Last import: {account.lastImportAt ? formatDateTime(account.lastImportAt) : '—'}</span>
                  </div>
                </div>

                <TimelineBar segments={account.segments} />

                <div className="imports-segment-list">
                  {account.segments?.map((segment) => (
                    <div key={`${segment.startDate}-${segment.endDate}`} className="imports-range-pill">
                      Covered: {formatDate(segment.startDate)} to {formatDate(segment.endDate)}
                    </div>
                  ))}
                </div>

                {account.gaps?.length > 0 ? (
                  <div className="imports-gap-list">
                    <h5>Potential gaps</h5>
                    <ul>
                      {account.gaps.map((gap) => (
                        <li key={`${gap.startDate}-${gap.endDate}`}>
                          {formatDate(gap.startDate)} to {formatDate(gap.endDate)} ({gap.days} days)
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="imports-no-gaps">No gaps detected between imported statement ranges.</div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="imports-history-section">
        <div className="documents-toolbar">
          <div>
            <h3>Recent Imports</h3>
            <p>Metadata only: original files are no longer stored.</p>
          </div>
        </div>

        {overview?.recentImports?.length > 0 ? (
          <div className="imports-history-list">
            {overview.recentImports.map((item) => (
              <div key={item.id} className="imports-history-item">
                <div>
                  <strong>{item.accountName}</strong>
                  <p>{item.filename || item.sourceType}</p>
                </div>
                <div>
                  <span>{formatDate(item.statementStartDate)} to {formatDate(item.statementEndDate)}</span>
                  <p>{item.importedCount} imported · {item.skippedCount} skipped</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="documents-empty-state">No imports recorded yet.</div>
        )}
      </section>
    </div>
  );
};

export default DocumentsPage;
