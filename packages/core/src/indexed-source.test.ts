import { describe, expect, it } from 'vitest';
import {
  UnusableSourceNameError,
  assertUsableSourceName,
  isIgnoredSourceName,
  mimeTypeFromName,
  planIndexedReconciliation,
  sourceFingerprint,
  type ProjectedSourceDocument,
} from './indexed-source';

const doc = (id: string, relativePath: string, sizeBytes = 10, modifiedAtMs = 1000, missing = false): ProjectedSourceDocument => ({
  id,
  relativePath,
  sizeBytes,
  modifiedAtMs,
  missing,
});

describe('source names and types', () => {
  it('skips hidden, lock and OS metadata files', () => {
    expect(isIgnoredSourceName('.DS_Store')).toBe(true);
    expect(isIgnoredSourceName('~$laporan.docx')).toBe(true);
    expect(isIgnoredSourceName('Thumbs.db')).toBe(true);
    expect(isIgnoredSourceName('laporan.docx')).toBe(false);
  });

  it('maps known extensions and falls back to octet-stream', () => {
    expect(mimeTypeFromName('Surat.PDF')).toBe('application/pdf');
    expect(mimeTypeFromName('nota')).toBe('application/octet-stream');
    expect(mimeTypeFromName('.bashrc')).toBe('application/octet-stream');
  });

  it('builds a stable fingerprint', () => {
    expect(sourceFingerprint(12, 1700000000123.9)).toBe('12:1700000000123');
  });

  it('accepts ordinary names and rejects path separators, hidden and lock files', () => {
    expect(assertUsableSourceName('Surat.pdf', 'file')).toBe('Surat.pdf');
    expect(assertUsableSourceName('  Geran  ', 'folder')).toBe('Geran');
    expect(() => assertUsableSourceName('a/b', 'file')).toThrow(UnusableSourceNameError);
    expect(() => assertUsableSourceName('.hidden', 'folder')).toThrow(UnusableSourceNameError);
    expect(() => assertUsableSourceName('~$lock.docx', 'file')).toThrow(UnusableSourceNameError);
    expect(() => assertUsableSourceName('..', 'folder')).toThrow(UnusableSourceNameError);
  });
});

describe('planIndexedReconciliation', () => {
  it('creates new files and updates unchanged ones without marking content changed', () => {
    const plan = planIndexedReconciliation([doc('a', 'x.txt')], [
      { relativePath: 'x.txt', sizeBytes: 10, modifiedAtMs: 1000 },
      { relativePath: 'y.txt', sizeBytes: 5, modifiedAtMs: 2000 },
    ]);
    expect(plan.update).toEqual([{ id: 'a', file: expect.objectContaining({ relativePath: 'x.txt' }), contentChanged: false }]);
    expect(plan.create.map((file) => file.relativePath)).toEqual(['y.txt']);
    expect(plan.missing).toEqual([]);
  });

  it('flags changed content and reappearing files', () => {
    const plan = planIndexedReconciliation([doc('a', 'x.txt'), doc('b', 'gone.txt', 10, 1000, true)], [
      { relativePath: 'x.txt', sizeBytes: 11, modifiedAtMs: 1000 },
      { relativePath: 'gone.txt', sizeBytes: 10, modifiedAtMs: 1000 },
    ]);
    expect(plan.update.map((entry) => entry.contentChanged)).toEqual([true, true]);
  });

  it('marks vanished files missing instead of deleting them', () => {
    const plan = planIndexedReconciliation([doc('a', 'x.txt'), doc('b', 'old/missing.txt', 10, 1000, true)], []);
    expect(plan.missing).toEqual(['a']);
  });

  it('keeps the id when a file is renamed in place or moved with its name', () => {
    const plan = planIndexedReconciliation([doc('a', 'A/surat.pdf', 10, 1000), doc('b', 'B/lama.txt', 20, 2000)], [
      { relativePath: 'C/surat.pdf', sizeBytes: 10, modifiedAtMs: 1000 },
      { relativePath: 'B/baharu.txt', sizeBytes: 20, modifiedAtMs: 2000 },
    ]);
    expect(plan.move.map((entry) => [entry.id, entry.file.relativePath])).toEqual([
      ['a', 'C/surat.pdf'],
      ['b', 'B/baharu.txt'],
    ]);
    expect(plan.create).toEqual([]);
    expect(plan.missing).toEqual([]);
  });

  it('does not link ambiguous or unrelated candidates', () => {
    const ambiguous = planIndexedReconciliation([doc('a', 'A/one.txt'), doc('b', 'A/two.txt')], [
      { relativePath: 'A/three.txt', sizeBytes: 10, modifiedAtMs: 1000 },
    ]);
    expect(ambiguous.move).toEqual([]);
    expect(ambiguous.missing.sort()).toEqual(['a', 'b']);

    const unrelated = planIndexedReconciliation([doc('a', 'A/one.txt')], [{ relativePath: 'B/other.txt', sizeBytes: 10, modifiedAtMs: 1000 }]);
    expect(unrelated.move).toEqual([]);
    expect(unrelated.create).toHaveLength(1);
    expect(unrelated.missing).toEqual(['a']);
  });
});
