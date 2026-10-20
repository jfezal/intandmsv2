import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type MountRecord = {
  connectorId: string;
  mountPath: string;
  mountGeneration: number;
  protocol: string;
  host: string;
  exportPath: string;
};

export class MountStateStore {
  constructor(private readonly slotsRoot: string) {}

  slotPath(connectorId: string): string {
    return path.join(this.slotsRoot, connectorId);
  }

  statePath(connectorId: string): string {
    return path.join(this.slotPath(connectorId), '.intandms-mount.json');
  }

  async ensureSlot(connectorId: string): Promise<string> {
    const slot = this.slotPath(connectorId);
    await mkdir(slot, { recursive: true });
    return slot;
  }

  async read(connectorId: string): Promise<MountRecord | null> {
    try {
      const raw = await readFile(this.statePath(connectorId), 'utf8');
      return JSON.parse(raw) as MountRecord;
    } catch {
      return null;
    }
  }

  async write(record: MountRecord): Promise<void> {
    await this.ensureSlot(record.connectorId);
    await writeFile(this.statePath(record.connectorId), JSON.stringify(record), { mode: 0o600 });
  }

  async clear(connectorId: string): Promise<void> {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(this.statePath(connectorId));
    } catch {
      /* ignore */
    }
  }

  async slotReachable(connectorId: string): Promise<boolean> {
    const slot = this.slotPath(connectorId);
    try {
      await access(slot);
      return true;
    } catch {
      return false;
    }
  }
}
