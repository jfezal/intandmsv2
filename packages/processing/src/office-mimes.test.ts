import { describe, expect, it } from 'vitest';
import { isLibreOfficePreviewTarget, isOfficeMime } from './office-mimes';

describe('office mimes', () => {
  it('detects docx mime', () => {
    expect(
      isOfficeMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
  });

  it('detects office by filename extension', () => {
    expect(
      isLibreOfficePreviewTarget('application/octet-stream', 'report.xlsx'),
    ).toBe(true);
  });
});
