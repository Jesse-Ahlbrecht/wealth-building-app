import React, { useMemo, useState, useCallback, useRef } from 'react';

const DOCUMENT_CATEGORY_ORDER = ['bank', 'broker', 'loan', 'other'];
const CATEGORY_LABELS = {
  bank: 'Bank Statements',
  broker: 'Broker Reports',
  loan: 'Loan & Credit Documents',
  other: 'Other Documents'
};

const inferDocumentCategory = (value) => {
  const key = (value || '').toLowerCase();
  if (!key) return 'other';
  if (key.includes('bank') || key.includes('statement') || key.includes('giro') || key.includes('yuh') || key.includes('dkb')) {
    return 'bank';
  }
  if (key.includes('broker') || key.includes('depot') || key.includes('viac') || key.includes('ing')) {
    return 'broker';
  }
  if (key.includes('loan') || key.includes('kfw') || key.includes('credit')) {
    return 'loan';
  }
  return 'other';
};

const formatFileSize = (size) => {
  if (size === null || size === undefined) return '';
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch (error) {
    return value;
  }
};

const formatDateOnly = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return value;
  }
};

const humanizeDocumentType = (key) => {
  if (!key) return 'Unknown';
  return key
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const computeAccept = (extensions = []) => {
  if (!extensions || extensions.length === 0) {
    return undefined;
  }
  return extensions.join(',');
};

const normalizeTypeKey = (value) =>
  (value || '').toString().trim().toLowerCase();

const DocumentsPage = ({
  documentTypes,
  documents,
  loading,
  onUpload,
  onDelete,
  onDeleteAll,
  onRefresh,
  onWipeData,
  onWipeDataConfirm,
  wipeState = {}
}) => {
  const [actionState, setActionState] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [documentsState, setDocumentsState] = useState(documents);
  const [confirmState, setConfirmState] = useState({
    open: false,
    document: null,
    busy: false,
    error: null
  });
  const [duplicateState, setDuplicateState] = useState({
    open: false,
    file: null,
    duplicates: []
  });
  const [bulkConfirmState, setBulkConfirmState] = useState({
    open: false,
    typeKey: null,
    documents: [],
    busy: false,
    error: null
  });
  const [openSettingsType, setOpenSettingsType] = useState(null);
  const [openGlobalSettings, setOpenGlobalSettings] = useState(false);
  const [expandedFileLists, setExpandedFileLists] = useState({});
  const settingsMenuRef = useRef(null);
  const settingsButtonRefs = useRef({});
  const globalSettingsMenuRef = useRef(null);
  const globalSettingsButtonRef = useRef(null);
  const confirmDocument = confirmState.document;
  const confirmBusy = confirmState.busy;
  const bulkConfirmType = bulkConfirmState.typeKey;
  const bulkConfirmBusy = bulkConfirmState.busy;
  const duplicateResolverRef = useRef(null);

  React.useEffect(() => {
    setDocumentsState(documents);
  }, [documents]);

  React.useEffect(() => {
    if (!openSettingsType) {
      settingsMenuRef.current = null;
      return undefined;
    }

    const handleClickOutside = (event) => {
      const menuEl = settingsMenuRef.current;
      const buttonEl = settingsButtonRefs.current[openSettingsType];
      if (menuEl && menuEl.contains(event.target)) {
        return;
      }
      if (buttonEl && buttonEl.contains(event.target)) {
        return;
      }
      setOpenSettingsType(null);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenSettingsType(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openSettingsType]);

  React.useEffect(() => {
    if (openSettingsType) {
      const docsForType = documentsState.filter((doc) => normalizeTypeKey(
        doc?.documentType ||
        doc?.file_type ||
        doc?.document_metadata?.file_info?.document_type ||
        doc?.metadata?.file_info?.document_type
      ) === openSettingsType);

      if (docsForType.length === 0) {
        setOpenSettingsType(null);
      }
    }
  }, [documentsState, openSettingsType]);

  React.useEffect(() => {
    if (!openGlobalSettings) {
      globalSettingsMenuRef.current = null;
      return undefined;
    }

    const handleClickOutside = (event) => {
      const menuEl = globalSettingsMenuRef.current;
      const buttonEl = globalSettingsButtonRef.current;
      if (menuEl && menuEl.contains(event.target)) {
        return;
      }
      if (buttonEl && buttonEl.contains(event.target)) {
        return;
      }
      setOpenGlobalSettings(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenGlobalSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openGlobalSettings]);

  const augmentedDocumentTypes = useMemo(() => {
    const normalizedBase = (documentTypes || []).map((type) => {
      const normalizedKey = normalizeTypeKey(type.key);
      const category = type.category || inferDocumentCategory(type.key || normalizedKey);
      return {
        ...type,
        key: normalizedKey,
        category: category || 'other'
      };
    });

    const knownKeys = new Set(normalizedBase.map((type) => type.key));
    const extras = [];

    documentsState.forEach((doc) => {
      const key = normalizeTypeKey(
        doc?.documentType ||
        doc?.file_type ||
        doc?.document_metadata?.file_info?.document_type ||
        doc?.metadata?.file_info?.document_type
      );
      if (key && !knownKeys.has(key)) {
        knownKeys.add(key);
        extras.push({
          key,
          label: humanizeDocumentType(key),
          description: 'Documents uploaded under this type.',
          extensions: [],
          category: inferDocumentCategory(key)
        });
      }
    });

    return [...normalizedBase, ...extras];
  }, [documentTypes, documentsState]);

  const documentTypesByCategory = useMemo(() => {
    const grouped = {
      bank: [],
      broker: [],
      loan: [],
      other: []
    };

    augmentedDocumentTypes.forEach((type) => {
      const category = type.category || 'other';
      if (grouped[category]) {
        grouped[category].push(type);
      } else {
        grouped.other.push(type);
      }
    });

    return grouped;
  }, [augmentedDocumentTypes]);

  const documentsByType = useMemo(() => {
    const map = {};
    augmentedDocumentTypes.forEach((type) => {
      map[type.key] = [];
    });

    documentsState.forEach((doc) => {
      const typeKey = normalizeTypeKey(
        doc?.documentType ||
        doc?.file_type ||
        doc?.document_metadata?.file_info?.document_type ||
        doc?.metadata?.file_info?.document_type
      ) || 'unknown';
      if (!map[typeKey]) {
        map[typeKey] = [];
      }
      map[typeKey].push(doc);
    });

    Object.values(map).forEach((list) => {
      list.sort((a, b) => {
        const dateA = new Date(a?.uploadedAt || a?.uploaded_at || 0).getTime();
        const dateB = new Date(b?.uploadedAt || b?.uploaded_at || 0).getTime();
        return dateB - dateA;
      });
    });

    return map;
  }, [augmentedDocumentTypes, documentsState]);

  const promptDeleteAll = useCallback((typeKey) => {
    if (typeof onDeleteAll !== 'function') {
      return;
    }
    const docsForType = documentsByType[typeKey] || [];
    if (!docsForType || docsForType.length === 0) {
      return;
    }

    setOpenSettingsType(null);

    setBulkConfirmState({
      open: true,
      typeKey,
      documents: docsForType,
      busy: false,
      error: null
    });
  }, [documentsByType, onDeleteAll]);

  const closeBulkConfirm = useCallback(() => {
    setBulkConfirmState((prev) => {
      if (prev.busy) {
        return prev;
      }
      return {
        open: false,
        typeKey: null,
        documents: [],
        busy: false,
        error: null
      };
    });
  }, []);

  const updateActionState = useCallback((typeKey, updater) => {
    const normalizedKey = normalizeTypeKey(typeKey) || 'unknown';
    setActionState((prev) => {
      const current = prev[normalizedKey] || {};
      const nextSlice = typeof updater === 'function'
        ? updater(current)
        : { ...current, ...(updater || {}) };
      return {
        ...prev,
        [normalizedKey]: nextSlice
      };
    });
  }, []);

  const promptDelete = useCallback((document) => {
    setConfirmState({
      open: true,
      document,
      busy: false,
      error: null
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => {
      if (prev.busy) {
        return prev;
      }
      return {
        open: false,
        document: null,
        busy: false,
        error: null
      };
    });
  }, []);

  const resolveDuplicatePrompt = useCallback((value) => {
    if (duplicateResolverRef.current) {
      duplicateResolverRef.current(value);
      duplicateResolverRef.current = null;
    }
    setDuplicateState({
      open: false,
      file: null,
      duplicates: []
    });
  }, []);

  const requestDuplicateConfirmation = useCallback((file, duplicates) => new Promise((resolve) => {
    duplicateResolverRef.current = resolve;
    setDuplicateState({
      open: true,
      file,
      duplicates
    });
  }), []);

  const dismissDuplicatePrompt = useCallback(() => {
    resolveDuplicatePrompt(false);
  }, [resolveDuplicatePrompt]);

  const acceptDuplicatePrompt = useCallback(() => {
    resolveDuplicatePrompt(true);
  }, [resolveDuplicatePrompt]);

  const handleFilesSelected = useCallback(async (typeKey, fileList) => {
    const normalizedTypeKey = normalizeTypeKey(typeKey) || 'unknown';
    if (!fileList || fileList.length === 0) {
      return;
    }

    // Preserve scroll position
    const scrollPosition = window.scrollY || window.pageYOffset;

    const files = Array.from(fileList);
    const timestamp = Date.now();
    const seenKeys = new Set();
    const computeDocKey = (docName, docSize) => {
      if (!docName || docSize === undefined || docSize === null) {
        return null;
      }
      return `${docName}::${Number(docSize)}`;
    };
    documentsState.forEach((doc) => {
      const name = doc?.originalName || doc?.original_name || doc?.file_name;
      const size =
        doc?.fileSize ??
        doc?.file_size ??
        doc?.metadata?.file_info?.original_size ??
        doc?.metadata?.file_info?.originalSize ??
        doc?.metadata?.file_info?.original_size;
      const key = computeDocKey(name, size);
      if (key) {
        seenKeys.add(key);
      }
    });

    const newEntries = files.map((file, idx) => ({
      key: `${timestamp}_${idx}_${file.name}`,
      fileName: file.name,
      uploadProgress: 0,
      uploadMessage: 'Preparing upload…',
      processingProgress: 0,
      processingMessage: 'Waiting to start…',
      status: 'uploading'
    }));

    updateActionState(normalizedTypeKey, (current) => ({
      ...current,
      uploading: true,
      error: null,
      success: null,
      uploads: [...(current.uploads || []), ...newEntries]
    }));

    try {
      const completed = [];
      const cancelled = [];
      const uploadedDocuments = []; // Batch document updates

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const entryKey = newEntries[index].key;

        const fileKey = computeDocKey(file.name, file.size);
        const duplicates = documentsState.filter((doc) => {
          const docName = doc?.originalName || doc?.original_name || doc?.file_name;
          const docSize =
            doc?.fileSize ??
            doc?.file_size ??
            doc?.metadata?.file_info?.original_size ??
            doc?.metadata?.file_info?.originalSize;
          return docName === file.name && Number(docSize) === Number(file.size);
        });

        if ((seenKeys.has(fileKey) || duplicates.length > 0) && fileKey) {
          const proceed = await requestDuplicateConfirmation(file, duplicates);
          if (!proceed) {
            updateActionState(normalizedTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              return {
                ...current,
                uploads
              };
            });
            cancelled.push(file);
            continue;
          }
        }

        if (fileKey) {
          seenKeys.add(fileKey);
        }

        // Throttle progress updates to reduce re-renders (max once per 100ms)
        let lastProgressUpdate = 0;
        const PROGRESS_THROTTLE_MS = 100;
        
        const emitProgress = (phase, progress, message, extra = {}) => {
          const now = Date.now();
          const shouldUpdate = (now - lastProgressUpdate) >= PROGRESS_THROTTLE_MS || 
                                progress === 100 || 
                                progress === 0 ||
                                phase === 'processing'; // Always update processing phase
          
          if (!shouldUpdate && progress !== 100 && progress !== 0) {
            return; // Skip this update
          }
          
          lastProgressUpdate = now;
          
          updateActionState(normalizedTypeKey, (current) => {
            const uploads = (current.uploads || []).map((upload) => {
              if (upload.key !== entryKey) return upload;
              const clamped = Math.max(0, Math.min(progress ?? 0, 100));
              if (phase === 'upload') {
                return {
                  ...upload,
                  uploadProgress: clamped,
                  uploadMessage: message || upload.uploadMessage,
                  ...extra
                };
              }
              if (phase === 'processing') {
                return {
                  ...upload,
                  processingProgress: clamped,
                  processingMessage: message || upload.processingMessage,
                  ...extra
                };
              }
              return upload;
            });
            return { ...current, uploads };
          });
        };

        emitProgress('upload', 5, 'Preparing file…');

        try {
          // Skip data fetches during batch uploads - will fetch once at the end
          const skipDataFetch = files.length > 1;
          const uploaded = await onUpload(normalizedTypeKey, file, {}, emitProgress, { skipDataFetch });

          emitProgress('processing', 100, 'Processing complete.', { processedCount: 'complete' });

          updateActionState(normalizedTypeKey, (current) => {
            const uploads = (current.uploads || []).map((upload) => (
              upload.key === entryKey
                ? { ...upload, status: 'success' }
                : upload
            ));
            return { ...current, uploads };
          });

          setTimeout(() => {
            updateActionState(normalizedTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              return { ...current, uploads };
            });
          }, 400);

          if (uploaded) {
            // Batch document updates instead of updating immediately
            uploadedDocuments.push(uploaded);
          }

          completed.push(file);
        } catch (error) {
          emitProgress('processing', 100, error?.message || 'Processing failed');
          updateActionState(normalizedTypeKey, (current) => {
            const uploads = (current.uploads || []).map((upload) => (
              upload.key === entryKey
                ? { ...upload, status: 'error' }
                : upload
            ));
            return {
              ...current,
              uploads,
              error: error?.message || 'Upload failed'
            };
          });
        }
      }

      // Batch update all uploaded documents at once to prevent multiple re-renders
      if (uploadedDocuments.length > 0) {
        setDocumentsState((prev) => {
          let updated = [...prev];
          // Remove duplicates and add new documents
          uploadedDocuments.forEach((newDoc) => {
            updated = updated.filter((doc) => doc.id !== newDoc.id);
            updated.unshift(newDoc); // Add to beginning
          });
          return updated;
        });
      }

      // Only refresh data once after all uploads complete (for batch uploads)
      // For batch uploads, defer the refresh slightly to let DOM settle and prevent jitter
      if (typeof onRefresh === 'function') {
        if (files.length > 1) {
          // Defer refresh for batch uploads to prevent layout shift
          setTimeout(async () => {
            await onRefresh();
            // Restore scroll after refresh completes
            requestAnimationFrame(() => {
              window.scrollTo(0, scrollPosition);
            });
          }, 150);
        } else {
          // Single file upload - refresh immediately
          await onRefresh();
        }
      }

      // Restore scroll position after all DOM updates complete (only for single file uploads)
      // For batch uploads, scroll is restored after refresh completes
      if (files.length === 1) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollPosition);
          });
        });
      }

      const hadFailures = (completed.length + cancelled.length) < files.length;
      updateActionState(normalizedTypeKey, {
        uploading: false,
        error: hadFailures ? 'Some uploads failed' : null,
        success:
          completed.length > 0
            ? completed.length === 1
              ? `${completed[0].name} uploaded`
              : `${completed.length} files uploaded`
            : null
      });
    } catch (error) {
      updateActionState(normalizedTypeKey, {
        uploading: false,
        error: error?.message || 'Upload failed'
      });
    }
  }, [onUpload, onRefresh, updateActionState, documentsState, requestDuplicateConfirmation]);

  const handleDelete = useCallback(async (document) => {
    if (!document?.id) {
      console.error('Cannot delete document: missing document ID', document);
      setConfirmState({ open: false, document: null, busy: false, error: 'Document ID is missing' });
      return;
    }

    const normalizedTypeKey = normalizeTypeKey(
      document?.documentType ||
      document?.file_type ||
      document?.document_metadata?.file_info?.document_type ||
      document?.metadata?.file_info?.document_type
    ) || 'unknown';

    console.log('Deleting document:', {
      id: document.id,
      name: document.originalName || document.original_name || document.file_name,
      type: normalizedTypeKey,
      documentType: document.documentType || document.file_type
    });

    setConfirmState((prev) => ({
      ...prev,
      busy: true,
      error: null
    }));
    setDeletingId(document.id);
    updateActionState(normalizedTypeKey, { error: null });

    try {
      const documentType = normalizeTypeKey(
        document.documentType ||
        document.file_type ||
        document?.document_metadata?.file_info?.document_type ||
        document?.metadata?.file_info?.document_type
      ) || 'unknown';
      await onDelete(document.id, documentType);
      setDocumentsState(prev => prev.filter(doc => doc.id !== document.id));
      setConfirmState({ open: false, document: null, busy: false, error: null });
      console.log('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      const errorMessage = error?.message || 'Failed to delete document';
      updateActionState(normalizedTypeKey, {
        error: errorMessage
      });
      setConfirmState((prev) => ({
        ...prev,
        busy: false,
        error: errorMessage
      }));
    } finally {
      setDeletingId(null);
    }
  }, [onDelete, updateActionState]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    const typeKey = bulkConfirmState.typeKey;
    if (!typeKey || typeof onDeleteAll !== 'function') {
      closeBulkConfirm();
      return;
    }

    setBulkConfirmState((prev) => ({
      ...prev,
      busy: true,
      error: null
    }));

    try {
      const deletedCount = await onDeleteAll(typeKey);

      if (deletedCount > 0) {
        setDocumentsState((prev) => prev.filter((doc) => {
          const docType = normalizeTypeKey(
            doc?.documentType ||
            doc?.file_type ||
            doc?.document_metadata?.file_info?.document_type ||
            doc?.metadata?.file_info?.document_type
          );
          return docType !== typeKey;
        }));
      }

      updateActionState(typeKey, {
        uploading: false,
        error: null,
        success:
          deletedCount > 0
            ? deletedCount === 1
              ? 'Deleted 1 document'
              : `Deleted ${deletedCount} documents`
            : null
      });

      setBulkConfirmState({
        open: false,
        typeKey: null,
        documents: [],
        busy: false,
        error: null
      });
    } catch (error) {
      setBulkConfirmState((prev) => ({
        ...prev,
        busy: false,
        error: error?.message || 'Failed to delete documents'
      }));
    }
  }, [bulkConfirmState, onDeleteAll, updateActionState, closeBulkConfirm]);

  return (
    <div className="documents-page">
      <div className="documents-toolbar">
        <div>
          <h3>Manage Files</h3>
          <p>
            Upload bank statements, broker reports, or loan documents.
          </p>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            ref={globalSettingsButtonRef}
            className={`document-card-settings-button ${openGlobalSettings ? 'open' : ''}`}
            onClick={() => setOpenGlobalSettings(prev => !prev)}
            aria-label="Global settings"
            title="Settings"
            style={{ fontSize: '18px', padding: '10px' }}
          >
            <i className="fa-solid fa-gear"></i>
          </button>
          {openGlobalSettings && (
            <div
              ref={globalSettingsMenuRef}
              className="document-card-menu"
              style={{ right: 0, top: '100%', marginTop: '8px' }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-primary)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                  Reset All Data
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--color-text-tertiary)', lineHeight: '1.4' }}>
                  Delete all uploaded statements, accounts, transactions, loans, and documents.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={wipeState?.keepCustomCategories ?? true}
                    onChange={(event) => wipeState?.setKeepCustomCategories?.(event.target.checked)}
                    disabled={wipeState?.loading}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Keep my custom categories</span>
                </label>
                {wipeState?.error && (
                  <div style={{ padding: '8px', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', fontSize: '12px', borderRadius: '6px', marginBottom: '8px' }}>
                    {wipeState.error}
                  </div>
                )}
                {wipeState?.success && (
                  <div style={{ padding: '8px', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: '12px', borderRadius: '6px', marginBottom: '8px' }}>
                    {wipeState.success}
                  </div>
                )}
                <button
                  className="danger-button"
                  onClick={() => {
                    onWipeData();
                    setOpenGlobalSettings(false);
                  }}
                  disabled={wipeState?.loading}
                  style={{ width: '100%', fontSize: '13px', padding: '8px 12px' }}
                >
                  {wipeState?.loading ? 'Deleting…' : 'Delete all data'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="documents-loading">
          Loading documents...
        </div>
      )}

      {!loading && augmentedDocumentTypes.length === 0 && (
        <div className="documents-empty-state">
          <p>No document types are available yet.</p>
        </div>
      )}

      {!loading && augmentedDocumentTypes.length > 0 && (
        <div className="documents-category-sections">
          {DOCUMENT_CATEGORY_ORDER.map((categoryKey) => {
            const typesForCategory = documentTypesByCategory[categoryKey] || [];
            if (!typesForCategory.length) {
              return null;
            }
            const categoryDocumentCount = typesForCategory.reduce((count, type) => (
              count + ((documentsByType[type.key] || []).length)
            ), 0);

            return (
              <section className="documents-category-panel" key={categoryKey}>
                <div className="documents-category-title-row">
                  <h4 className="documents-category-title">{CATEGORY_LABELS[categoryKey]}</h4>
                  <span className="documents-category-count">
                    {categoryDocumentCount} {categoryDocumentCount === 1 ? 'document' : 'documents'}
                  </span>
                </div>
                <div className="document-grid">
                  {typesForCategory.map((type) => {
      const typeKey = type.key;
                    const docsForType = documentsByType[typeKey] || [];
                    const state = actionState[typeKey] || {};
                    const isSettingsOpen = openSettingsType === typeKey;

                    return (
                      <div className="document-card" key={typeKey}>
                        <div className="document-card-header">
                          <div>
                            <h4>{type.label}</h4>
                            {type.description && <p>{type.description}</p>}
                          </div>
                          <div className="document-card-tools">
                            {type.extensions && type.extensions.length > 0 && (
                              <span className="document-extensions">
                                {type.extensions.join(', ')}
                              </span>
                            )}
                            <button
                              ref={(node) => {
                                if (node) {
                                  settingsButtonRefs.current[typeKey] = node;
                                } else {
                                  delete settingsButtonRefs.current[typeKey];
                                }
                              }}
                              className={`document-card-settings-button ${isSettingsOpen ? 'open' : ''}`}
                              onClick={() => setOpenSettingsType(prev => (prev === typeKey ? null : typeKey))}
                              disabled={docsForType.length === 0 && !isSettingsOpen}
                              aria-label={`Settings for ${type.label}`}
                              title="Document settings"
                            >
                              <i className="fa-solid fa-gear"></i>
                            </button>
                          </div>
                        </div>
                        {isSettingsOpen && (
                          <div
                            ref={(node) => {
                              if (isSettingsOpen) {
                                settingsMenuRef.current = node;
                              }
                            }}
                            className="document-card-menu"
                          >
                            <button
                              className="document-card-menu-item danger"
                              onClick={() => promptDeleteAll(typeKey)}
                              disabled={docsForType.length === 0 || bulkConfirmBusy}
                            >
                              Delete all documents
                            </button>
                          </div>
                        )}

                        <label className="document-upload-button">
                          <input
                            type="file"
                            accept={computeAccept(type.extensions)}
                            multiple
                            onChange={(event) => {
                              handleFilesSelected(typeKey, event.target.files);
                              event.target.value = '';
                            }}
                            disabled={state.uploading}
                          />
                          <span>{state.uploading ? 'Uploading…' : 'Select files'}</span>
                        </label>

                        {state.uploads && state.uploads.length > 0 && (
                          <div className="document-upload-status-list">
                            {state.uploads.map((upload) => (
                              <div
                                key={upload.key}
                                className={`document-upload-status ${upload.status}`}
                              >
                                <div className="document-upload-status-header">
                                  <span className="document-status-name">{upload.fileName}</span>
                                  <span className="document-status-state">
                                    {upload.status === 'success'
                                      ? 'Completed'
                                      : upload.status === 'error'
                                        ? 'Failed'
                                        : 'In progress'}
                                  </span>
                                </div>
                                <div className="dual-progress">
                                  <div className="progress-row">
                                    <span className="progress-label">Upload</span>
                                    <span className="progress-value">{Math.round(upload.uploadProgress)}%</span>
                                  </div>
                                  <div className="progress-track">
                                    <div
                                      className="progress-fill"
                                      style={{ width: `${upload.uploadProgress || 0}%` }}
                                    />
                                  </div>
                                  <span className="progress-message">{upload.uploadMessage}</span>
                                </div>
                                <div className="dual-progress">
                                  <div className="progress-row">
                                    <span className="progress-label">Processing</span>
                                    <span className="progress-value">{Math.round(upload.processingProgress)}%</span>
                                  </div>
                                  <div className="progress-track">
                                    <div
                                      className={`progress-fill ${upload.status === 'error' ? 'error' : ''}`}
                                      style={{ width: `${upload.processingProgress || 0}%` }}
                                    />
                                  </div>
                                  <span className="progress-message">{upload.processingMessage}</span>
                                  {upload.processedCount && (
                                    <span className="progress-count">{upload.processedCount}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {state.error && (
                          <div className="document-status document-status-error">
                            {state.error}
                          </div>
                        )}
                        {state.success && (
                          <div className="document-status document-status-success">
                            {state.success}
                          </div>
                        )}

                        <div className="document-list">
                          {docsForType.length === 0 && (
                            <p className="document-empty">No documents uploaded yet.</p>
                          )}
                          {docsForType.length > 0 && (() => {
                            const isExpanded = expandedFileLists[typeKey] || false;
                            const maxVisible = 3;
                            const visibleDocs = isExpanded ? docsForType : docsForType.slice(0, maxVisible);
                            const hasMore = docsForType.length > maxVisible;
                            
                            return (
                              <>
                                <ul>
                                  {visibleDocs.map((doc) => {
                                    const docTypeValue = normalizeTypeKey(
                                      doc.documentType ||
                                      doc.file_type ||
                                      doc.document_metadata?.file_info?.document_type ||
                                      doc.metadata?.file_info?.document_type
                                    );
                                    return (
                                    <li className="document-item" key={doc.id}>
                                      <div className="document-item-info">
                                        <span className="document-name">
                                          {doc.originalName || doc.original_name || doc.file_name}
                                        </span>
                                        <span className="document-meta">
                                          {formatFileSize(doc.fileSize || doc.file_size)} •{' '}
                                          {formatDateTime(doc.uploadedAt || doc.uploaded_at)}
                                        </span>
                                        {(() => {
                                          const summary = doc?.documentMetadata?.statementSummary || doc?.metadata?.statementSummary;
                                          if (summary && (summary.startDate || summary.endDate)) {
                                            return (
                                              <span className="document-summary">
                                                <span style={{ color: 'var(--color-text-tertiary)' }}>Coverage:</span>
                                                <strong>{formatDateOnly(summary.startDate) || '—'}</strong>
                                                <span className="summary-arrow">→</span>
                                                <strong>{formatDateOnly(summary.endDate) || '—'}</strong>
                                              </span>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                      <div className="document-item-actions">
                                        <button
                                          className="document-delete-button"
                                          onClick={() => promptDelete({ ...doc, documentType: docTypeValue })}
                                          disabled={deletingId === doc.id || confirmBusy}
                                        >
                                          {deletingId === doc.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                      </div>
                                    </li>
                                  );
                                  })}
                                </ul>
                                {hasMore && (
                                  <button
                                    className="document-list-toggle"
                                    onClick={() => setExpandedFileLists(prev => ({
                                      ...prev,
                                      [typeKey]: !prev[typeKey]
                                    }))}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      marginTop: '8px',
                                      border: '1px solid var(--color-border-primary)',
                                      borderRadius: '6px',
                                      backgroundColor: 'var(--color-bg-card)',
                                      color: 'var(--color-text-primary)',
                                      fontSize: '13px',
                                      cursor: 'pointer',
                                      fontWeight: '500'
                                    }}
                                  >
                                    {isExpanded 
                                      ? `Show less (${docsForType.length - maxVisible} hidden)`
                                      : `Show ${docsForType.length - maxVisible} more file${docsForType.length - maxVisible === 1 ? '' : 's'}`}
                                    <i 
                                      className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}
                                      style={{ marginLeft: '8px' }}
                                    />
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {confirmState.open && (
        <div
          className="modal-overlay open"
          onClick={closeConfirm}
        >
          <div
            className="modal-content open documents-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Delete document?</h3>
                <p>
                  This will permanently remove{' '}
                  <strong>
                    {confirmState.document?.originalName
                      || confirmState.document?.original_name
                      || confirmState.document?.file_name
                      || 'this document'}
                  </strong>
                  . Imported data stays unless this is your last statement.
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={closeConfirm}
                disabled={confirmBusy}
                aria-label="Close delete confirmation"
              >
                ×
              </button>
            </div>

            <div className="documents-confirm-body">
              <div className="documents-confirm-meta">
                <span className="documents-confirm-label">Uploaded</span>
                <span className="documents-confirm-value">
                  {formatDateTime(confirmState.document?.uploadedAt || confirmState.document?.uploaded_at) || '—'}
                </span>
              </div>
              <div className="documents-confirm-meta">
                <span className="documents-confirm-label">Size</span>
                <span className="documents-confirm-value">
                  {formatFileSize(confirmState.document?.fileSize || confirmState.document?.file_size) || '—'}
                </span>
              </div>
              {(confirmState.document?.documentType || confirmState.document?.file_type) && (
                <div className="documents-confirm-meta">
                  <span className="documents-confirm-label">Type</span>
                  <span className="documents-confirm-value">
                    {humanizeDocumentType(
                      normalizeTypeKey(
                        confirmState.document?.documentType
                        || confirmState.document?.file_type
                        || confirmState.document?.metadata?.file_info?.document_type
                      )
                    )}
                  </span>
                </div>
              )}
              {confirmState.error && (
                <div className="documents-confirm-error">
                  {confirmState.error}
                </div>
              )}
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={closeConfirm}
                disabled={confirmBusy}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  if (!confirmDocument || confirmBusy) {
                    return;
                  }
                  handleDelete(confirmDocument);
                }}
                disabled={confirmBusy}
              >
                {confirmBusy ? 'Deleting…' : 'Delete document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateState.open && (
        <div
          className="modal-overlay open"
          onClick={dismissDuplicatePrompt}
        >
          <div
            className="modal-content open documents-duplicate-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Document already uploaded?</h3>
                <p>
                  <strong>{duplicateState.file?.name}</strong>{' '}
                  ({formatFileSize(duplicateState.file?.size) || 'unknown size'}) appears to match a document you have already imported.
                  Duplicate data will be filtered out. Continue?
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissDuplicatePrompt();
                }}
                aria-label="Close duplicate warning"
              >
                ×
              </button>
            </div>

            <div className="documents-duplicate-body">
              {duplicateState.duplicates && duplicateState.duplicates.length > 0 ? (
                <ul className="documents-duplicate-list">
                  {duplicateState.duplicates.map((dup) => {
                    const dupName = dup?.originalName || dup?.original_name || dup?.file_name;
                    const dupSize =
                      dup?.fileSize ??
                      dup?.file_size ??
                      dup?.metadata?.file_info?.original_size ??
                      dup?.metadata?.file_info?.originalSize;
                    const dupUploaded = dup?.uploadedAt || dup?.uploaded_at;
                    return (
                      <li key={`${dup?.id || dupName}`} className="documents-duplicate-item">
                        <div className="documents-duplicate-name">{dupName || 'Unknown document'}</div>
                        <div className="documents-duplicate-meta">
                          <span>{formatFileSize(dupSize) || '—'}</span>
                          <span>•</span>
                          <span>{formatDateTime(dupUploaded) || '—'}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="documents-duplicate-empty">
                  Previously uploaded during this selection.
                </div>
              )}
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissDuplicatePrompt();
                }}
              >
                Cancel
              </button>
              <button
                className="documents-duplicate-continue"
                onClick={(event) => {
                  event.stopPropagation();
                  acceptDuplicatePrompt();
                }}
              >
                Upload anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirmState.open && (
        <div
          className="modal-overlay open"
          onClick={closeBulkConfirm}
        >
          <div
            className="modal-content open documents-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Delete all documents?</h3>
                <p>
                  This will permanently remove{' '}
                  <strong>{bulkConfirmState.documents.length}</strong>{' '}
                  document{bulkConfirmState.documents.length === 1 ? '' : 's'} from{' '}
                  <strong>{bulkConfirmType ? humanizeDocumentType(bulkConfirmType) : 'this category'}</strong>.
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  closeBulkConfirm();
                }}
                disabled={bulkConfirmBusy}
                aria-label="Close delete all confirmation"
              >
                ×
              </button>
            </div>

            <div className="documents-confirm-body">
              {bulkConfirmState.documents.slice(0, 5).map((doc) => {
                const docName = doc?.originalName || doc?.original_name || doc?.file_name;
                const docSize =
                  doc?.fileSize ??
                  doc?.file_size ??
                  doc?.metadata?.file_info?.original_size ??
                  doc?.metadata?.file_info?.originalSize;
                const docUploaded = doc?.uploadedAt || doc?.uploaded_at;
                return (
                  <div key={doc?.id || docName} className="documents-bulk-delete-item">
                    <div className="documents-bulk-delete-name">{docName || 'Document'}</div>
                    <div className="documents-bulk-delete-meta">
                      {formatFileSize(docSize) || '—'} • {formatDateTime(docUploaded) || '—'}
                    </div>
                  </div>
                );
              })}
              {bulkConfirmState.documents.length > 5 && (
                <div className="documents-bulk-delete-more">
                  +{bulkConfirmState.documents.length - 5} additional document{bulkConfirmState.documents.length - 5 === 1 ? '' : 's'}
                </div>
              )}
              {bulkConfirmState.error && (
                <div className="documents-confirm-error">
                  {bulkConfirmState.error}
                </div>
              )}
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={(event) => {
                  event.stopPropagation();
                  closeBulkConfirm();
                }}
                disabled={bulkConfirmBusy}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleBulkDeleteConfirm();
                }}
                disabled={bulkConfirmBusy}
              >
                {bulkConfirmBusy ? 'Deleting…' : 'Delete documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {wipeState?.showConfirm && (
        <div
          className="modal-overlay open"
          onClick={() => wipeState?.setShowConfirm?.(false)}
        >
          <div
            className="modal-content open documents-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Delete all data?</h3>
                <p>
                  This will delete <strong>all accounts, transactions, loans, documents, and other financial data</strong>.
                  {wipeState?.keepCustomCategories ? ' Your custom categories will remain.' : ' All custom categories will also be deleted.'}
                  {' '}<strong>This action cannot be undone.</strong>
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  wipeState?.setShowConfirm?.(false);
                }}
                aria-label="Close confirmation"
              >
                ×
              </button>
            </div>

            <div className="documents-confirm-body">
              <div className="documents-wipe-warning">
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '24px', color: 'var(--color-error)', marginBottom: '8px' }}></i>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: 'var(--color-error)' }}>
                  Warning: This will permanently erase all your financial data
                </p>
              </div>
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={(event) => {
                  event.stopPropagation();
                  wipeState?.setShowConfirm?.(false);
                }}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (typeof onWipeDataConfirm === 'function') {
                    onWipeDataConfirm();
                  }
                }}
              >
                Delete all data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;

