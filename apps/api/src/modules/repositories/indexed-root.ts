import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { resolveContainedDirectory, SourceWriteError } from '@intandms/storage';
import type { PrismaClient, Repository, StorageConnection } from '@prisma/client';

type IndexedConfig = { connectorId?: string; mountPath?: string };

export function mapSourceWriteError(error: unknown): never {
  if (error instanceof SourceWriteError) {
    if (error.code === 'exists') {
      throw new ConflictException(error.message);
    }
    if (error.code === 'not_writable') {
      throw new ServiceUnavailableException(error.message);
    }
    throw new BadRequestException(error.message);
  }
  throw error;
}

export async function resolveIndexedScanRoot(
  prisma: PrismaClient,
  repository: Pick<Repository, 'type' | 'status' | 'rootRelativePath'> & {
    storageConnection: Pick<StorageConnection, 'config'> | null;
  },
): Promise<string> {
  if (repository.type !== 'INDEXED' || repository.status !== 'ACTIVE') {
    throw new BadRequestException('Active indexed repository required.');
  }
  const config = (repository.storageConnection?.config ?? {}) as IndexedConfig;
  let mountPath = config.mountPath;
  if (config.connectorId) {
    const connector = await prisma.indexedConnector.findUnique({ where: { id: config.connectorId } });
    if (!connector || connector.status !== 'ACTIVE') {
      throw new ServiceUnavailableException('Connector is missing or disabled.');
    }
    mountPath = connector.mountPath ?? undefined;
  }
  if (!mountPath) {
    throw new ServiceUnavailableException('Connector is not mounted.');
  }
  try {
    return await resolveContainedDirectory(mountPath, repository.rootRelativePath);
  } catch {
    throw new ServiceUnavailableException('The storage source is not available.');
  }
}
