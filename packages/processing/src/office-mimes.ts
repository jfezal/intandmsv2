const OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt']);

export function isOfficeMime(mimeType: string): boolean {
  return OFFICE_MIMES.has(mimeType);
}

export function isOfficeFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  for (const ext of OFFICE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

export function isLibreOfficePreviewTarget(mimeType: string, fileName?: string): boolean {
  if (isOfficeMime(mimeType)) {
    return true;
  }
  return fileName ? isOfficeFileName(fileName) : false;
}
