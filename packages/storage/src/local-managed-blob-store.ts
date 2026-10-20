import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolveSafePath } from './path-guard';

export type PublishResult = {
  storageKey: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
};

export class LocalManagedBlobStore {
  constructor(private readonly rootAbsolute: string) {}

  async publishStream(
    repositoryRelativeDir: string,
    stream: Readable,
  ): Promise<PublishResult> {
    const objectId = randomUUID();
    const storageKey = path.posix.join(repositoryRelativeDir, `${objectId}.bin`);
    const absolutePath = resolveSafePath({
      rootAbsolute: this.rootAbsolute,
      relativePath: storageKey,
    });

    await mkdir(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.part`;
    const hash = createHash('sha256');
    let sizeBytes = 0;

    const digest = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });

    await pipeline(stream, digest, createWriteStream(tempPath, { flags: 'wx' }));
    await rename(tempPath, absolutePath);

    return {
      storageKey,
      absolutePath,
      sha256: hash.digest('hex'),
      sizeBytes,
    };
  }

  async readBytes(storageKey: string): Promise<Buffer> {
    const absolutePath = resolveSafePath({
      rootAbsolute: this.rootAbsolute,
      relativePath: storageKey,
    });
    return readFile(absolutePath);
  }

  async statObject(storageKey: string): Promise<{ sizeBytes: number }> {
    const absolutePath = resolveSafePath({
      rootAbsolute: this.rootAbsolute,
      relativePath: storageKey,
    });
    const fileStat = await stat(absolutePath);
    return { sizeBytes: fileStat.size };
  }
}
