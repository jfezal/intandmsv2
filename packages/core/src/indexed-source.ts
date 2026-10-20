const MAX_FILE_NAME = 512;
const MAX_FOLDER_NAME = 256;
const ILLEGAL_SOURCE_NAME = /[\\/:*?"<>|\u0000]/;

export class UnusableSourceNameError extends Error {
  constructor(message = 'That name is not allowed on the source.') {
    super(message);
    this.name = 'UnusableSourceNameError';
  }
}

/** Names skipped when projecting an indexed source: OS metadata, editor lock files and hidden entries. */
export function isIgnoredSourceName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    name.startsWith('.') ||
    name.startsWith('~$') ||
    lower === 'thumbs.db' ||
    lower === 'desktop.ini' ||
    lower === '$recycle.bin' ||
    lower === 'system volume information' ||
    lower.endsWith('.tmp')
  );
}

/** Rejects path separators, ignored/hidden names and empty names before creating a source entry. */
export function assertUsableSourceName(name: string, kind: 'file' | 'folder'): string {
  const trimmed = name.normalize('NFC').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || ILLEGAL_SOURCE_NAME.test(trimmed)) {
    throw new UnusableSourceNameError();
  }
  if (isIgnoredSourceName(trimmed)) {
    throw new UnusableSourceNameError();
  }
  const max = kind === 'file' ? MAX_FILE_NAME : MAX_FOLDER_NAME;
  if (trimmed.length > max) {
    throw new UnusableSourceNameError();
  }
  return trimmed;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  log: 'text/plain',
  json: 'application/json',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};

/** Extension-based type for display and preview selection only; it is never trusted to approve content. */
export function mimeTypeFromName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'application/octet-stream';
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream';
}

export function sourceFingerprint(sizeBytes: number, modifiedAtMs: number): string {
  return `${sizeBytes}:${Math.trunc(modifiedAtMs)}`;
}

export type ObservedSourceFile = { relativePath: string; sizeBytes: number; modifiedAtMs: number };

export type ProjectedSourceDocument = {
  id: string;
  relativePath: string;
  sizeBytes: number | null;
  modifiedAtMs: number | null;
  missing: boolean;
};

export type IndexedReconciliationPlan = {
  create: ObservedSourceFile[];
  /** Same path seen again; `contentChanged` when size/mtime differ or it had been missing. */
  update: Array<{ id: string; file: ObservedSourceFile; contentChanged: boolean }>;
  /** Vanished from one path and appeared at another with identical size and mtime: keeps the document id. */
  move: Array<{ id: string; from: string; file: ObservedSourceFile }>;
  /** Not seen this scan: marked missing, never deleted. */
  missing: string[];
};

function parentOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

function baseName(relativePath: string): string {
  return relativePath.slice(relativePath.lastIndexOf('/') + 1);
}

/**
 * Compares the projected documents with one complete scan. Move detection is deliberately
 * conservative: only an unambiguous one-to-one pair with the same size and mtime that also kept
 * its file name (moved folder) or its folder (renamed) is linked; anything else becomes
 * missing + new so two different files are never merged.
 */
export function planIndexedReconciliation(
  existing: ProjectedSourceDocument[],
  observed: ObservedSourceFile[],
): IndexedReconciliationPlan {
  const byPath = new Map(existing.map((document) => [document.relativePath, document]));
  const seen = new Set<string>();
  const update: IndexedReconciliationPlan['update'] = [];
  const fresh: ObservedSourceFile[] = [];

  for (const file of observed) {
    seen.add(file.relativePath);
    const current = byPath.get(file.relativePath);
    if (current) {
      const contentChanged =
        current.missing || current.sizeBytes !== file.sizeBytes || current.modifiedAtMs !== Math.trunc(file.modifiedAtMs);
      update.push({ id: current.id, file, contentChanged });
    } else {
      fresh.push(file);
    }
  }

  const vanished = existing.filter((document) => !document.missing && !seen.has(document.relativePath));
  const key = (size: number | null, mtime: number | null) => `${size}:${mtime === null ? null : Math.trunc(mtime)}`;
  const vanishedByKey = new Map<string, ProjectedSourceDocument[]>();
  for (const document of vanished) {
    if (document.sizeBytes === null || document.modifiedAtMs === null) continue;
    const list = vanishedByKey.get(key(document.sizeBytes, document.modifiedAtMs)) ?? [];
    list.push(document);
    vanishedByKey.set(key(document.sizeBytes, document.modifiedAtMs), list);
  }
  const freshByKey = new Map<string, ObservedSourceFile[]>();
  for (const file of fresh) {
    const list = freshByKey.get(key(file.sizeBytes, file.modifiedAtMs)) ?? [];
    list.push(file);
    freshByKey.set(key(file.sizeBytes, file.modifiedAtMs), list);
  }

  const move: IndexedReconciliationPlan['move'] = [];
  const movedIds = new Set<string>();
  const movedPaths = new Set<string>();
  for (const [fingerprint, candidates] of vanishedByKey) {
    const arrivals = freshByKey.get(fingerprint) ?? [];
    if (candidates.length !== 1 || arrivals.length !== 1) continue;
    const [document] = candidates as [ProjectedSourceDocument];
    const [file] = arrivals as [ObservedSourceFile];
    const related =
      baseName(document.relativePath) === baseName(file.relativePath) || parentOf(document.relativePath) === parentOf(file.relativePath);
    if (!related) continue;
    move.push({ id: document.id, from: document.relativePath, file });
    movedIds.add(document.id);
    movedPaths.add(file.relativePath);
  }

  return {
    create: fresh.filter((file) => !movedPaths.has(file.relativePath)),
    update,
    move,
    missing: vanished.filter((document) => !movedIds.has(document.id)).map((document) => document.id),
  };
}
