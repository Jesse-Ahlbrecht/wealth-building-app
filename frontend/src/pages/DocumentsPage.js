import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:5001';

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
    files: [], // Array of { file, duplicates, entryKey }
    resolved: {} // Map of entryKey -> boolean (user's decision)
  });
  const duplicateStateRef = useRef(duplicateState);
  const duplicateResolverRef = useRef(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    duplicateStateRef.current = duplicateState;
  }, [duplicateState]);
  
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
  const categoryMismatchResolverRef = useRef(null);
  const showWipeConfirm = Boolean(wipeState?.showConfirm);

  // Close any open settings menus when the wipe confirmation modal is visible
  useEffect(() => {
    if (showWipeConfirm) {
      setOpenGlobalSettings(false);
      setOpenSettingsType(null);
    }
  }, [showWipeConfirm]);

  const requestBatchDuplicateConfirmation = useCallback((filesWithDuplicates) => {
    return new Promise((resolve) => {
      duplicateResolverRef.current = resolve;
      setDuplicateState({
        open: true,
        files: filesWithDuplicates,
        resolved: {}
      });
    });
  }, []);

  const resolveBatchDuplicates = useCallback((proceedAll) => {
    // Capture resolver BEFORE updating state
    const resolver = duplicateResolverRef.current;
    
    if (resolver) {
      // Build resolved object by reading current state from ref
      const currentState = duplicateStateRef.current;
      const resolved = {};
      currentState.files.forEach(({ entryKey }) => {
        resolved[entryKey] = proceedAll !== undefined ? proceedAll : (currentState.resolved[entryKey] || false);
      });
      
      // Update state to close modal
      setDuplicateState({
        open: false,
        files: [],
        resolved: {}
      });
      
      // Clear resolver ref
      duplicateResolverRef.current = null;
      
      // Call resolver with the resolved object synchronously
      if (typeof resolver === 'function') {
        resolver(resolved);
      }
    } else {
      // No resolver, just close the modal
      setDuplicateState({
        open: false,
        files: [],
        resolved: {}
      });
    }
  }, []);

  const updateDuplicateResolution = useCallback((entryKey, proceed) => {
    setDuplicateState(prev => ({
      ...prev,
      resolved: {
        ...prev.resolved,
        [entryKey]: proceed
      }
    }));
  }, []);

  const requestBatchCategoryMismatch = useCallback((filesWithMismatches) => {
    return new Promise((resolve) => {
      categoryMismatchResolverRef.current = resolve;
      setCategoryMismatchModal({
        open: true,
        files: filesWithMismatches,
        resolved: {}
      });
    });
  }, []);

  const resolveBatchCategoryMismatch = useCallback((proceedAll) => {
    // Capture resolver BEFORE updating state
    const resolver = categoryMismatchResolverRef.current;
    
    if (resolver) {
      // Build resolved object by reading current state from ref
      const currentState = categoryMismatchModalRef.current;
      const resolved = {};
      currentState.files.forEach(({ entryKey }) => {
        resolved[entryKey] = proceedAll !== undefined ? proceedAll : (currentState.resolved[entryKey] || false);
      });
      
      // Update state to close modal
      setCategoryMismatchModal({
        open: false,
        files: [],
        resolved: {}
      });
      
      // Clear resolver ref
      categoryMismatchResolverRef.current = null;
      
      // Call resolver with the resolved object synchronously
      if (typeof resolver === 'function') {
        resolver(resolved);
      }
    } else {
      // No resolver, just close the modal
      setCategoryMismatchModal({
        open: false,
        files: [],
        resolved: {}
      });
    }
  }, []);

  const updateCategoryMismatchResolution = useCallback((entryKey, proceed) => {
    setCategoryMismatchModal(prev => ({
      ...prev,
      resolved: {
        ...prev.resolved,
        [entryKey]: proceed
      }
    }));
  }, []);

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
    // Normalize filename for duplicate detection
    const normalizeFileName = (fileName) => {
      if (!fileName) return '';
      // Decode URL encoding
      try {
        fileName = decodeURIComponent(fileName);
      } catch (e) {
        // If decoding fails, use original
      }
      // Remove common browser-added suffixes like " 2", " (1)", " - Copy", etc.
      // Pattern: space or dash followed by number or "Copy" at the end before extension
      fileName = fileName.replace(/\s*[-_]?\s*(\(?\d+\)?|Copy|copy)\s*(?=\.[^.]+$)/i, '');
      // Normalize whitespace (multiple spaces to single space, trim)
      fileName = fileName.replace(/\s+/g, ' ').trim();
      // Convert to lowercase for case-insensitive comparison
      return fileName.toLowerCase();
    };

    const computeDocKey = (docName, docSize) => {
      if (!docName || docSize === undefined || docSize === null) {
        return null;
      }
      const normalizedName = normalizeFileName(docName);
      return `${normalizedName}::${Number(docSize)}`;
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
      const uploadedDocuments = [];
      const movedToOtherCategories = new Set(); // Track files moved to other categories
      const PROGRESS_THROTTLE_MS = 100;

      // Step 1a: Check for duplicates within the current upload batch first
      const filesToCheck = files.map((file, index) => {
        const fileKey = computeDocKey(file.name, file.size);
        console.log(`[Batch Duplicate Check] File ${index}: name="${file.name}", size=${file.size}, fileKey="${fileKey}"`);
        return {
          file,
          entryKey: newEntries[index].key,
          fileKey
        };
      });

      const batchSeenKeys = new Set();
      const batchSeenFiles = new Map(); // Track which entryKey corresponds to which fileKey
      const batchDuplicates = [];
      const filesAfterBatchCheck = [];
      
      // First pass: detect duplicates within the batch
      for (const { file, entryKey, fileKey } of filesToCheck) {
        if (!fileKey) {
          // File without valid key, skip duplicate check but still process
          filesAfterBatchCheck.push({ file, entryKey, fileKey });
          continue;
        }
        
        if (batchSeenKeys.has(fileKey)) {
          // This file is a duplicate within the current batch
          const originalEntryKey = batchSeenFiles.get(fileKey);
          batchDuplicates.push({ 
            file, 
            entryKey, 
            fileKey, 
            isBatchDuplicate: true,
            originalEntryKey 
          });
          console.log(`Batch duplicate detected: ${file.name} (${file.size} bytes) matches entryKey ${originalEntryKey}`);
        } else {
          // First occurrence of this file
          batchSeenKeys.add(fileKey);
          batchSeenFiles.set(fileKey, entryKey);
          filesAfterBatchCheck.push({ file, entryKey, fileKey });
        }
      }

      console.log(`Batch duplicate check: ${batchDuplicates.length} duplicates found out of ${filesToCheck.length} files`);

      // Show batch duplicate modal if there are duplicates within the batch
      if (batchDuplicates.length > 0) {
        // Create a mock duplicates array for the modal (showing it's a batch duplicate)
        const batchDuplicatesWithMock = batchDuplicates.map(({ file, entryKey }) => ({
          file,
          entryKey,
          duplicates: [{ originalName: 'Duplicate in current upload', isBatchDuplicate: true }]
        }));
        
        const batchDuplicateResolutions = await requestBatchDuplicateConfirmation(batchDuplicatesWithMock);
        
        // Process batch duplicate resolutions
        batchDuplicates.forEach(({ file, entryKey }) => {
          const proceed = batchDuplicateResolutions[entryKey];
          if (!proceed) {
            updateActionState(normalizedTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              return { ...current, uploads };
            });
            cancelled.push(file);
          } else {
            // User chose to proceed, add to files to check against existing documents
            filesAfterBatchCheck.push({ file, entryKey, fileKey: computeDocKey(file.name, file.size) });
          }
        });
      }

      // Step 1b: Check for duplicates against already-uploaded documents
      const filesWithDuplicates = [];
      const filesAfterDuplicateCheck = [];
      
      for (const { file, entryKey, fileKey } of filesAfterBatchCheck) {
        const fileNormalizedName = normalizeFileName(file.name);
        const duplicates = documentsState.filter((doc) => {
          const docName = doc?.originalName || doc?.original_name || doc?.file_name;
          const docSize =
            doc?.fileSize ??
            doc?.file_size ??
            doc?.metadata?.file_info?.original_size ??
            doc?.metadata?.file_info?.originalSize;
          const docNormalizedName = normalizeFileName(docName);
          return docNormalizedName === fileNormalizedName && Number(docSize) === Number(file.size);
        });

        // Check for duplicates against existing documents
        const isDuplicate = duplicates.length > 0 && fileKey;
        if (isDuplicate) {
          filesWithDuplicates.push({ file, entryKey, duplicates });
        } else {
          if (fileKey) {
            seenKeys.add(fileKey);
          }
          filesAfterDuplicateCheck.push({ file, entryKey, fileKey });
        }
      }

      // Show batch duplicate modal if there are any duplicates
      if (filesWithDuplicates.length > 0) {
        const duplicateResolutions = await requestBatchDuplicateConfirmation(filesWithDuplicates);
        
        // Process duplicate resolutions
        filesWithDuplicates.forEach(({ file, entryKey }) => {
          const proceed = duplicateResolutions[entryKey];
          if (!proceed) {
            updateActionState(normalizedTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              return { ...current, uploads };
            });
            cancelled.push(file);
          } else {
            // User chose to proceed, add to files to process
            const fileKey = computeDocKey(file.name, file.size);
            if (fileKey) {
              seenKeys.add(fileKey);
            }
            filesAfterDuplicateCheck.push({ file, entryKey, fileKey });
          }
        });
      }

      // Step 2: Detect document types for all remaining files in parallel
      // Only proceed if there are files to process
      if (filesAfterDuplicateCheck.length === 0) {
        // No files to process after duplicate check - reset uploading state
        updateActionState(normalizedTypeKey, {
          uploading: false,
          error: null,
          success: null
        });
        return;
      }

      const typeDetectionResults = await Promise.all(
        filesAfterDuplicateCheck.map(async ({ file, entryKey, fileKey }) => {
          // Detect document type
          const detectedType = await detectDocumentType(file);
          return { file, entryKey, fileKey, detectedType };
        })
      );

      // Step 3: Collect mismatches and show batch modal
      const filesWithMismatches = [];
      const filesToProcess = [];
      
      for (const result of typeDetectionResults) {
        const { file, entryKey, detectedType } = result;
        
        // If detected type differs from selected type, collect for batch modal
        if (detectedType && detectedType !== normalizedTypeKey) {
          filesWithMismatches.push({
            file,
            entryKey,
            selectedType: normalizedTypeKey,
            detectedType
          });
        } else {
          // No mismatch, upload to selected category
          filesToProcess.push({
            file,
            entryKey,
            targetTypeKey: normalizedTypeKey,
            isMoved: false
          });
        }
      }

      // Show batch category mismatch modal if there are any mismatches
      if (filesWithMismatches.length > 0) {
        const mismatchResolutions = await requestBatchCategoryMismatch(filesWithMismatches);
        
        // Process mismatch resolutions
        filesWithMismatches.forEach(({ file, entryKey, detectedType }) => {
          const proceedWithCorrectType = mismatchResolutions[entryKey];
          if (proceedWithCorrectType) {
            // User chose to upload to correct category
            filesToProcess.push({
              file,
              entryKey,
              targetTypeKey: detectedType,
              isMoved: true
            });
          } else {
            // User chose to skip - remove from uploads list and mark as cancelled
            updateActionState(normalizedTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              return { ...current, uploads };
            });
            cancelled.push(file);
          }
        });
      }

      // Step 4: Process all uploads in parallel
      if (filesToProcess.length === 0) {
        // No files to process after duplicates/mismatches - reset uploading state
        updateActionState(normalizedTypeKey, {
          uploading: false,
          error: null,
          success: null
        });
        return;
      }

      const uploadPromises = filesToProcess.map(async ({ file, entryKey, targetTypeKey, isMoved }) => {
        const isCorrectCategory = targetTypeKey !== normalizedTypeKey;
        
        // Create progress emitter for this file
        let lastProgressUpdate = 0;
        const emitProgress = (phase, progress, message, extra = {}) => {
          const now = Date.now();
          const shouldUpdate = (now - lastProgressUpdate) >= PROGRESS_THROTTLE_MS || 
                                progress === 100 || 
                                progress === 0 ||
                                phase === 'processing';
          
          if (!shouldUpdate && progress !== 100 && progress !== 0) {
            return;
          }
          
          lastProgressUpdate = now;
          
          updateActionState(targetTypeKey, (current) => {
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

        // If moving to different category, update UI
        if (isMoved && isCorrectCategory) {
          // Remove from current type's upload list
          updateActionState(normalizedTypeKey, (current) => {
            const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
            const hasOtherUploads = uploads.length > 0;
            return { 
              ...current, 
              uploads,
              uploading: hasOtherUploads ? current.uploading : false
            };
          });
          
          // Add to correct type's upload list
          const newEntry = {
            key: entryKey,
            fileName: file.name,
            uploadProgress: 5,
            uploadMessage: 'Preparing upload…',
            processingProgress: 0,
            processingMessage: 'Waiting to start…',
            status: 'uploading'
          };
          
          updateActionState(targetTypeKey, (current) => ({
            ...current,
            uploading: true,
            uploads: [...(current.uploads || []), newEntry]
          }));
          
          // Initialize progress for moved file
          emitProgress('upload', 5, 'Preparing upload…');
        } else {
        emitProgress('upload', 5, 'Preparing file…');
        }

        try {
          const skipDataFetch = files.length > 1;
          const uploaded = await onUpload(targetTypeKey, file, {}, emitProgress, { skipDataFetch });

          emitProgress('processing', 100, 'Processing complete.', { processedCount: 'complete' });

          updateActionState(targetTypeKey, (current) => {
            const uploads = (current.uploads || []).map((upload) => (
              upload.key === entryKey
                ? { ...upload, status: 'success' }
                : upload
            ));
            const hasOtherUploads = uploads.some(u => u.key !== entryKey && u.status === 'uploading');
            return { 
              ...current, 
              uploads,
              uploading: hasOtherUploads,
              success: filesToProcess.length === 1 ? `${file.name} uploaded` : null
            };
          });

          setTimeout(() => {
            updateActionState(targetTypeKey, (current) => {
              const uploads = (current.uploads || []).filter((upload) => upload.key !== entryKey);
              const hasOtherUploads = uploads.length > 0;
              return { 
                ...current, 
                uploads,
                uploading: hasOtherUploads ? current.uploading : false
              };
            });
          }, 400);

          if (isMoved && isCorrectCategory) {
            movedToOtherCategories.add(file.name);
          }

          return { file, uploaded, success: true, targetTypeKey, isMoved, isCorrectCategory };
        } catch (error) {
          emitProgress('processing', 100, error?.message || 'Processing failed');
          updateActionState(targetTypeKey, (current) => {
            const uploads = (current.uploads || []).map((upload) => (
              upload.key === entryKey
                ? { ...upload, status: 'error' }
                : upload
            ));
            const hasOtherUploads = uploads.some(u => u.key !== entryKey && u.status === 'uploading');
            return {
              ...current,
              uploads,
              uploading: hasOtherUploads,
              error: error?.message || 'Upload failed'
            };
          });
          return { file, uploaded: null, success: false, error, targetTypeKey, isMoved, isCorrectCategory };
        }
      });

      // Wait for all uploads to complete (use allSettled to handle errors gracefully)
      const uploadResults = await Promise.allSettled(uploadPromises);
      
      // Collect results and track moved categories
      const movedCategories = new Set();
      uploadResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { file, uploaded, success, targetTypeKey, isMoved, isCorrectCategory } = result.value;
          if (success) {
            completed.push(file);
            if (uploaded) {
              uploadedDocuments.push(uploaded);
            }
          }
          // Track categories that files were moved to
          if (isMoved && isCorrectCategory && targetTypeKey !== normalizedTypeKey) {
            movedCategories.add(targetTypeKey);
          }
        } else {
          // Handle rejected promises
          console.error('Upload promise rejected:', result.reason);
        }
      });

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

      // Filter out files that were moved to other categories
      const completedInThisCategory = completed.filter(f => !movedToOtherCategories.has(f.name));
      const hadFailures = (completedInThisCategory.length + cancelled.length) < files.length;
      
      // Reset uploading state for original category
      updateActionState(normalizedTypeKey, {
        uploading: false,
        error: hadFailures ? 'Some uploads failed' : null,
        success:
          completedInThisCategory.length > 0
            ? completedInThisCategory.length === 1
              ? `${completedInThisCategory[0].name} uploaded`
              : `${completedInThisCategory.length} files uploaded`
            : null
      });
      
      // Reset uploading state for moved categories
      movedCategories.forEach(categoryKey => {
        updateActionState(categoryKey, (current) => {
          const hasActiveUploads = (current.uploads || []).some(u => u.status === 'uploading');
          return {
            ...current,
            uploading: hasActiveUploads
          };
        });
      });
    } catch (error) {
      updateActionState(normalizedTypeKey, {
        uploading: false,
        error: error?.message || 'Upload failed'
      });
    }
  }, [onUpload, onRefresh, updateActionState, documentsState, requestBatchDuplicateConfirmation, requestBatchCategoryMismatch]);

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

  const [autoDetectUploading, setAutoDetectUploading] = useState(false);
  const autoDetectFileInputRef = useRef(null);
  const [unknownFilesModal, setUnknownFilesModal] = useState({
    open: false,
    files: []
  });
  const [categoryMismatchModal, setCategoryMismatchModal] = useState({
    open: false,
    files: [], // Array of { file, entryKey, selectedType, detectedType }
    resolved: {} // Map of entryKey -> boolean (user's decision)
  });
  const categoryMismatchModalRef = useRef(categoryMismatchModal);
  
  // Keep ref in sync with state
  useEffect(() => {
    categoryMismatchModalRef.current = categoryMismatchModal;
  }, [categoryMismatchModal]);

  const getDocumentTypeLabel = useCallback((typeKey) => {
    if (!typeKey || !documentTypes) return humanizeDocumentType(typeKey);
    const normalizedKey = normalizeTypeKey(typeKey);
    const type = documentTypes.find(t => normalizeTypeKey(t.key) === normalizedKey);
    return type ? type.label : humanizeDocumentType(typeKey);
  }, [documentTypes]);

  const detectDocumentType = useCallback(async (file) => {
    if (!file) return null;
    
    try {
      // Get session token from localStorage
      const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('sessionToken') : null;
      if (!sessionToken) {
        console.warn('No session token available for document type detection');
        return null;
      }
      
      // Create FormData with file
      const formData = new FormData();
      formData.append('file', file, file.name);
      
      // Call backend detection endpoint
      const response = await fetch(`${API_BASE_URL}/api/documents/detect-type`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        },
        body: formData
      });
      
      if (response.status === 401) {
        // Authentication failed - clear session
        localStorage.removeItem('sessionToken');
        localStorage.removeItem('user');
        // Trigger page reload to show login screen
        window.location.reload();
        return null;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error detecting document type:', errorData.error);
        return null;
      }
      
      const responseData = await response.json();
      console.log('Detection response for', file.name, ':', responseData);
      
      // Handle wrapped response from authentication decorator
      const data = responseData.data || responseData;
      return data.documentType || null;
    } catch (error) {
      console.error('Error detecting document type for', file.name, ':', error);
      return null;
    }
  }, []);

  const handleAutoDetectUpload = useCallback(async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    
    const files = Array.from(fileList);
    setAutoDetectUploading(true);
    
    try {
      // Create file copies for detection (to avoid consuming the original file objects)
      // We'll store both the original file and create a new File from blob for detection
      const filesWithBlobs = await Promise.all(
        files.map(async (file) => {
          // Create a new File object from the blob so we can reuse the original
          const blob = file.slice ? file.slice(0, file.size, file.type) : file;
          const fileCopy = new File([blob], file.name, { type: file.type });
          return { original: file, copy: fileCopy };
        })
      );
      
      // Detect types for all files using copies
      const detectionPromises = filesWithBlobs.map(async ({ original, copy }) => {
        const detectedType = await detectDocumentType(copy);
        return { file: original, detectedType };
      });
      
      const detectionResults = await Promise.all(detectionPromises);
      
      console.log('All detection results:', detectionResults);
      
      // Group files by detected type
      const filesByType = {};
      const unknownFiles = [];
      
      detectionResults.forEach(({ file, detectedType }) => {
        console.log('Processing result - file:', file.name, 'detectedType:', detectedType);
        if (detectedType) {
          if (!filesByType[detectedType]) {
            filesByType[detectedType] = [];
          }
          filesByType[detectedType].push(file);
        } else {
          unknownFiles.push(file);
        }
      });
      
      console.log('Grouped by type:', Object.keys(filesByType));
      console.log('Unknown files:', unknownFiles.map(f => f.name));
      
      // Upload files grouped by type
      for (const [typeKey, typeFiles] of Object.entries(filesByType)) {
        await handleFilesSelected(typeKey, typeFiles);
      }
      
      // Show warning for unknown files using modal
      if (unknownFiles.length > 0) {
        setUnknownFilesModal({
          open: true,
          files: unknownFiles.map(f => f.name)
        });
      }
    } catch (error) {
      console.error('Error in auto-detect upload:', error);
      setUnknownFilesModal({
        open: true,
        files: [],
        error: error.message || 'Error uploading files'
      });
    } finally {
      setAutoDetectUploading(false);
      if (autoDetectFileInputRef.current) {
        autoDetectFileInputRef.current.value = '';
      }
    }
  }, [detectDocumentType, handleFilesSelected]);

  return (
    <div className="documents-page">
      <div className="documents-toolbar">
        <div>
          <h3>Manage Files</h3>
          <p>
            Upload bank statements, broker reports, or loan documents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label
            className="document-card-settings-button"
            style={{
              cursor: autoDetectUploading ? 'not-allowed' : 'pointer',
              opacity: autoDetectUploading ? 0.5 : 1,
              width: 'auto',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '500'
            }}
            title="Upload multiple documents from different banks. The system will automatically detect the document type and categorize them correctly."
          >
            <input
              ref={autoDetectFileInputRef}
              type="file"
              accept=".csv,.CSV,.pdf,.PDF"
              multiple
              onChange={(event) => {
                if (event.target.files && event.target.files.length > 0) {
                  handleAutoDetectUpload(event.target.files);
                }
                event.target.value = '';
              }}
              disabled={autoDetectUploading}
              style={{ display: 'none' }}
            />
            {autoDetectUploading ? 'Detecting...' : 'Automatic Upload'}
          </label>
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
          {openGlobalSettings && !showWipeConfirm && (
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
                    setOpenGlobalSettings(false);
                    onWipeData();
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
                                    
                                    // Get document metadata - use consistent source
                                    // Also check if this document is currently being uploaded (merge progress if available)
                                    const docMetadata = doc?.documentMetadata || doc?.metadata || {};
                                    const docName = doc.originalName || doc.original_name || doc.file_name;
                                    
                                    // Check if this document is in the upload queue for this type
                                    const currentUpload = actionState[docTypeValue]?.uploads?.find(
                                      u => u.fileName === docName
                                    );
                                    
                                    // Use upload progress if available, otherwise use document metadata
                                    const summary = docMetadata.statementSummary;
                                    const processingStatus = currentUpload 
                                      ? (currentUpload.processingProgress < 100 ? 'processing' : docMetadata.processingStatus)
                                      : docMetadata.processingStatus;
                                    const processingProgress = currentUpload?.processingProgress ?? docMetadata.processingProgress;
                                    const processingTotal = docMetadata.processingTotal;
                                    const processingProcessed = docMetadata.processingProcessed;
                                    
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
                                          // Show processing status if document is still processing
                                          // Check processing status FIRST, before checking summary
                                          // Only show if status is explicitly 'processing' (not 'pending' unless there's actual progress)
                                          const isActuallyProcessing = processingStatus === 'processing' || 
                                            (processingStatus === 'pending' && (processingProgress !== undefined || processingTotal !== undefined));
                                          
                                          if (isActuallyProcessing) {
                                            const progressText = processingProgress !== undefined && processingTotal !== undefined
                                              ? `${processingProcessed || 0}/${processingTotal} (${processingProgress || 0}%)`
                                              : processingProgress !== undefined
                                              ? `${processingProgress}%`
                                              : 'Processing...';
                                            return (
                                              <span className="document-summary" style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                                                Processing... {progressText !== 'Processing...' && `(${progressText})`}
                                              </span>
                                            );
                                          }
                                          
                                          // Show coverage if available (only if processing is complete)
                                          const hasSummary = summary && (summary.startDate || summary.endDate);
                                          if (hasSummary && processingStatus === 'complete') {
                                            return (
                                              <span className="document-summary">
                                                <span style={{ color: 'var(--color-text-tertiary)' }}>Coverage:</span>
                                                <strong>{formatDateOnly(summary.startDate) || '—'}</strong>
                                                <span className="summary-arrow">→</span>
                                                <strong>{formatDateOnly(summary.endDate) || '—'}</strong>
                                              </span>
                                            );
                                          }
                                          
                                          // If no summary but processing is complete, show nothing (or could show "No transactions")
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

      {duplicateState.open && duplicateState.files.length > 0 && (
        <div
          className="modal-overlay open"
          onClick={() => resolveBatchDuplicates(false)}
        >
          <div
            className="modal-content open documents-duplicate-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Duplicate documents detected</h3>
                <p>
                  {duplicateState.files.some(f => f.duplicates?.[0]?.isBatchDuplicate) ? (
                    <>
                      <strong>{duplicateState.files.length}</strong> file{duplicateState.files.length === 1 ? '' : 's'} appear{duplicateState.files.length === 1 ? 's' : ''} multiple times in the current upload.
                      Would you like to skip the duplicate{duplicateState.files.length === 1 ? '' : 's'}?
                    </>
                  ) : (
                    <>
                      <strong>{duplicateState.files.length}</strong> file{duplicateState.files.length === 1 ? '' : 's'} appear{duplicateState.files.length === 1 ? 's' : ''} to match documents you have already imported.
                      Duplicate data will be filtered out. Continue with upload?
                    </>
                  )}
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  resolveBatchDuplicates(false);
                }}
                aria-label="Close duplicate warning"
              >
                ×
              </button>
            </div>

            <div className="documents-duplicate-body">
                <ul className="documents-duplicate-list">
                {duplicateState.files.map(({ file, entryKey, duplicates }) => {
                  const fileName = file?.name || 'Unknown file';
                  const fileSize = file?.size;
                  const isResolved = duplicateState.resolved[entryKey] !== undefined;
                  const proceed = duplicateState.resolved[entryKey];
                  
                    return (
                    <li key={entryKey} className="documents-duplicate-item" style={{
                      padding: '12px',
                      marginBottom: '8px',
                      backgroundColor: isResolved 
                        ? (proceed ? 'var(--color-success-bg)' : 'var(--color-error-bg)')
                        : 'var(--color-bg-tertiary)',
                      border: `1px solid ${isResolved 
                        ? (proceed ? 'var(--color-success)' : 'var(--color-error)')
                        : 'var(--color-border-primary)'}`,
                      borderRadius: '8px',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="documents-duplicate-name" style={{ fontWeight: '500', marginBottom: '4px', wordBreak: 'break-word' }}>
                            {fileName}
                          </div>
                          <div className="documents-duplicate-meta" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                            <span>{formatFileSize(fileSize) || '—'}</span>
                            {duplicates && duplicates.length > 0 && (
                              <>
                                <span> • </span>
                                {duplicates[0]?.isBatchDuplicate ? (
                                  <span>Duplicate in current upload</span>
                                ) : (
                                  <span>Matches {duplicates.length} existing document{duplicates.length === 1 ? '' : 's'}</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button
                            className="documents-cancel-button"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              opacity: isResolved && !proceed ? 1 : 0.6,
                              fontWeight: isResolved && !proceed ? '600' : '500'
                            }}
                            onClick={() => updateDuplicateResolution(entryKey, false)}
                          >
                            Skip
                          </button>
                          <button
                            className="documents-primary-button"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              opacity: isResolved && proceed ? 1 : 0.6,
                              fontWeight: isResolved && proceed ? '600' : '500'
                            }}
                            onClick={() => updateDuplicateResolution(entryKey, true)}
                          >
                            Upload
                          </button>
                        </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={(event) => {
                  event.stopPropagation();
                  resolveBatchDuplicates(false);
                }}
                aria-label="Skip all duplicate uploads"
              >
                Skip all
              </button>
              <button
                className="documents-primary-button"
                onClick={(event) => {
                  event.stopPropagation();
                  resolveBatchDuplicates(true);
                }}
                aria-label="Upload all duplicates"
              >
                Upload all
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

      {unknownFilesModal.open && (
        <div
          className="modal-overlay open"
          onClick={() => setUnknownFilesModal({ open: false, files: [] })}
        >
          <div
            className="modal-content open documents-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>{unknownFilesModal.error ? 'Upload Error' : 'Could not detect document type'}</h3>
                <p>
                  {unknownFilesModal.error ? (
                    unknownFilesModal.error
                  ) : (
                    <>
                      Could not automatically detect document type for{' '}
                      <strong>{unknownFilesModal.files.length}</strong> file{unknownFilesModal.files.length === 1 ? '' : 's'}.
                      Please upload these files manually by selecting the correct document type.
                    </>
                  )}
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setUnknownFilesModal({ open: false, files: [] })}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {unknownFilesModal.files.length > 0 && (
              <div className="documents-confirm-body" style={{ overflowX: 'hidden' }}>
                <ul style={{ 
                  listStyle: 'none', 
                  padding: 0, 
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                  minWidth: 0
                }}>
                  {unknownFilesModal.files.map((fileName, idx) => (
                    <li 
                      key={idx}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        overflowWrap: 'break-word',
                        wordWrap: 'break-word',
                        maxWidth: '100%',
                        minWidth: 0,
                        overflow: 'hidden',
                        boxSizing: 'border-box'
                      }}
                      title={fileName}
                    >
                      {fileName}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={() => setUnknownFilesModal({ open: false, files: [] })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryMismatchModal.open && categoryMismatchModal.files.length > 0 && (
        <div
          className="modal-overlay open"
          onClick={() => resolveBatchCategoryMismatch(false)}
        >
          <div
            className="modal-content open documents-confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-confirm-header">
              <div>
                <h3>Document type mismatch detected</h3>
                <p>
                  <strong>{categoryMismatchModal.files.length}</strong> file{categoryMismatchModal.files.length === 1 ? '' : 's'} appear{categoryMismatchModal.files.length === 1 ? 's' : ''} to be in a different category than selected.
                  Would you like to upload {categoryMismatchModal.files.length === 1 ? 'it' : 'them'} to the correct categor{categoryMismatchModal.files.length === 1 ? 'y' : 'ies'} instead?
                </p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => resolveBatchCategoryMismatch(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="documents-confirm-body">
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {categoryMismatchModal.files.map(({ file, entryKey, selectedType, detectedType }) => {
                  const fileName = file?.name || 'Unknown file';
                  const isResolved = categoryMismatchModal.resolved[entryKey] !== undefined;
                  const proceed = categoryMismatchModal.resolved[entryKey];
                  
                  return (
                    <li key={entryKey} style={{
                      padding: '12px',
                      backgroundColor: isResolved 
                        ? (proceed ? 'var(--color-success-bg)' : 'var(--color-error-bg)')
                        : 'var(--color-bg-tertiary)',
                      border: `1px solid ${isResolved 
                        ? (proceed ? 'var(--color-success)' : 'var(--color-error)')
                        : 'var(--color-border-primary)'}`,
                      borderRadius: '8px',
                      transition: 'all 0.2s ease'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '500', marginBottom: '4px', wordBreak: 'break-word' }}>
                            {fileName}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                            Selected: <strong>{getDocumentTypeLabel(selectedType)}</strong> • 
                            Detected: <strong>{getDocumentTypeLabel(detectedType)}</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <button
                            className="documents-cancel-button"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              opacity: isResolved && !proceed ? 1 : 0.6,
                              fontWeight: isResolved && !proceed ? '600' : '500'
                            }}
                            onClick={() => updateCategoryMismatchResolution(entryKey, false)}
                          >
                            Skip
                          </button>
                          <button
                            className="documents-primary-button"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              opacity: isResolved && proceed ? 1 : 0.6,
                              fontWeight: isResolved && proceed ? '600' : '500'
                            }}
                            onClick={() => updateCategoryMismatchResolution(entryKey, true)}
                          >
                            Upload to correct category
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="documents-confirm-actions">
              <button
                className="documents-cancel-button"
                onClick={() => resolveBatchCategoryMismatch(false)}
              >
                Skip documents
              </button>
              <button
                className="documents-primary-button"
                onClick={() => resolveBatchCategoryMismatch(true)}
              >
                Upload Documents to the correct Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;

