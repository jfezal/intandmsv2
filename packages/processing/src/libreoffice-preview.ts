import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export type LibreOfficePreviewResult =
  | { ok: true; pdfBytes: Buffer }
  | { ok: false; reason: 'disabled' | 'timeout' | 'failed'; detail?: string };

const DEFAULT_TIMEOUT_MS = 120_000;

function runLibreOfficeConvert(
  inputPath: string,
  outDir: string,
  timeoutMs: number,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = process.env.LIBREOFFICE_BIN ?? 'libreoffice';
    const child = spawn(
      bin,
      ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', outDir, inputPath],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

export async function convertToPdfWithLibreOffice(
  sourceAbsolutePath: string,
): Promise<LibreOfficePreviewResult> {
  if (process.env.LIBREOFFICE_DISABLED === 'true') {
    return { ok: false, reason: 'disabled' };
  }

  const timeoutMs = Number(process.env.LIBREOFFICE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'intandms-lo-'));

  try {
    const { code, stderr } = await runLibreOfficeConvert(sourceAbsolutePath, workDir, timeoutMs);
    if (code !== 0) {
      return { ok: false, reason: 'failed', detail: stderr.slice(0, 512) || `exit ${code}` };
    }

    const baseName = path.basename(sourceAbsolutePath, path.extname(sourceAbsolutePath));
    const pdfPath = path.join(workDir, `${baseName}.pdf`);
    const pdfBytes = await readFile(pdfPath);
    if (pdfBytes.length === 0) {
      return { ok: false, reason: 'failed', detail: 'empty pdf output' };
    }
    return { ok: true, pdfBytes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) {
      return { ok: false, reason: 'disabled', detail: 'libreoffice binary not found' };
    }
    return { ok: false, reason: 'failed', detail: message.slice(0, 512) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
