import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function isOcrEnabled(): boolean {
  return process.env.OCR_ENABLED === 'true';
}

export async function runTesseractOcr(absolutePath: string, languages = 'eng+msa'): Promise<string | null> {
  if (!isOcrEnabled()) {
    return null;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'intandms-ocr-'));
  const outputBase = path.join(workDir, 'out');
  try {
    await execFileAsync('tesseract', [absolutePath, outputBase, '-l', languages], {
      timeout: 300_000,
    });
    const text = await readFile(`${outputBase}.txt`, 'utf8');
    return text.slice(0, 32_000);
  } catch {
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
