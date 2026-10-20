import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

export type StoredCredential = {
  username: string;
  password: string;
};

export class CredentialStore {
  constructor(private readonly rootDir: string) {}

  private filePath(connectorId: string): string {
    return path.join(this.rootDir, `${connectorId}.json`);
  }

  async save(connectorId: string, cred: StoredCredential): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(this.filePath(connectorId), JSON.stringify(cred), { mode: 0o600 });
  }

  async load(connectorId: string): Promise<StoredCredential | null> {
    try {
      const raw = await readFile(this.filePath(connectorId), 'utf8');
      return JSON.parse(raw) as StoredCredential;
    } catch {
      return null;
    }
  }

  async clear(connectorId: string): Promise<void> {
    await rm(this.filePath(connectorId), { force: true });
  }
}
