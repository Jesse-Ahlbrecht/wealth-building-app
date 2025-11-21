/**
 * Document Helper Functions
 */

export const normalizeTypeKey = (value) =>
  (value || '').toString().trim().toLowerCase();

export const normalizeDocumentRecord = (doc) => {
  if (!doc) return doc;
  
  let metadata = doc.documentMetadata ?? doc.metadata ?? {};
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (error) {
      metadata = {};
    }
  }
  if (!metadata || typeof metadata !== 'object') {
    metadata = {};
  }

  const fileInfo = metadata.file_info || doc.fileInfo || {};
  const documentType =
    doc.documentType ||
    doc.file_type ||
    fileInfo.document_type ||
    metadata.document_type ||
    (doc.documentMetadata && doc.documentMetadata.document_type);

  return {
    ...doc,
    documentType,
    documentMetadata: metadata,
    metadata,
    fileInfo
  };
};

