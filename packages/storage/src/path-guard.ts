import path from 'node:path';

export type PathGuardOptions = {
  rootAbsolute: string;
  relativePath: string;
};

export function resolveSafePath(options: PathGuardOptions): string {
  const root = path.resolve(options.rootAbsolute);
  const candidate = path.resolve(root, options.relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error('Path escapes managed root.');
  }
  return candidate;
}
