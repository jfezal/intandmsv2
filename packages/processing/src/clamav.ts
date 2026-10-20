import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'skipped'; reason: string };

export async function scanFileWithClamAv(absolutePath: string): Promise<ScanResult> {
  if (process.env.CLAMAV_DISABLED === 'true') {
    return { status: 'skipped', reason: 'CLAMAV_DISABLED' };
  }

  try {
    const { stdout } = await execFileAsync('clamscan', ['--no-summary', absolutePath], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    if (stdout.includes('OK')) {
      return { status: 'clean' };
    }
    return { status: 'skipped', reason: 'unexpected_clamscan_output' };
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 1 && typeof err.stdout === 'string' && err.stdout.includes('FOUND')) {
      const line = err.stdout.split('\n').find((row) => row.includes('FOUND')) ?? '';
      const signature = line.split(':').pop()?.replace(' FOUND', '').trim() ?? 'unknown';
      return { status: 'infected', signature };
    }
    if (typeof err.stderr === 'string' && err.stderr.includes('No such file')) {
      return { status: 'skipped', reason: 'clamscan_not_installed' };
    }
    return { status: 'skipped', reason: 'clamscan_unavailable' };
  }
}
