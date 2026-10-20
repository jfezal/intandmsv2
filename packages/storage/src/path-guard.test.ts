import { describe, expect, it } from 'vitest';
import { resolveSafePath } from './path-guard';

describe('resolveSafePath', () => {
  it('allows paths inside root', () => {
    const resolved = resolveSafePath({
      rootAbsolute: '/tmp/managed',
      relativePath: 'repos/abc/file.bin',
    });
    expect(resolved).toBe('/tmp/managed/repos/abc/file.bin');
  });

  it('rejects path traversal', () => {
    expect(() =>
      resolveSafePath({
        rootAbsolute: '/tmp/managed',
        relativePath: '../etc/passwd',
      }),
    ).toThrow(/escapes managed root/);
  });
});
