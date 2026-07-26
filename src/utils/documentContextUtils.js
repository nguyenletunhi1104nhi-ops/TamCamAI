export function getLatestDocument(documents = []) {
  return Array.isArray(documents) && documents.length > 0 ? documents[0] : null;
}

export function getDocumentText(document) {
  return (
    document?.text ||
    document?.documentText ||
    document?.textPreview ||
    ""
  );
}

export function getDocumentFileName(document, fallback = "tài liệu này") {
  return document?.fileName || document?.file?.name || fallback;
}

export function hasReadableDocumentText(document) {
  return Boolean(getDocumentText(document).trim());
}
