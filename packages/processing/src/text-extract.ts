import { readFile } from 'node:fs/promises';

const TEXT_MIMES = ['text/', 'application/json', 'application/xml'];

export async function extractIndexText(
  absolutePath: string,
  mimeType: string,
  sha256: string,
): Promise<string> {
  if (TEXT_MIMES.some((prefix) => mimeType.startsWith(prefix))) {
    const bytes = await readFile(absolutePath);
    return bytes.toString('utf8').slice(0, 32_000);
  }
  return `${mimeType} ${sha256}`;
}
