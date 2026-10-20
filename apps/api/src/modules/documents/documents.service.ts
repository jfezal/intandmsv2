import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PERMISSIONS,
  UnusableSourceNameError,
  assertUsableSourceName,
  mimeTypeFromName,
  sourceFingerprint,
} from '@intandms/core';
import { scanFileWithClamAv } from '@intandms/processing';
import {
  LocalManagedBlobStore,
  resolveContainedDirectory,
  resolveContainedFile,
  resolveManagedStorageRoot,
  writeNewContainedFile,
} from '@intandms/storage';
import { Prisma, type Repository, type StorageConnection } from '@prisma/client';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { type FileHandle, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AppEnv } from '../../config/env.schema';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { mapSourceWriteError, resolveIndexedScanRoot } from '../repositories/indexed-root';

type DocumentContent = { displayName: string; mimeType: string; body: Buffer | Readable };

const INLINE_TEXT = new Set(['text/plain', 'text/csv', 'text/markdown']);

/** Served from the app origin, so scriptable types (HTML, SVG) are never rendered inline. */
function isInlinePreviewable(mime: string): boolean {
  return (mime.startsWith('image/') && mime !== 'image/svg+xml') || mime === 'application/pdf' || INLINE_TEXT.has(mime);
}

@Injectable()
export class DocumentsService {
  private readonly blobStore: LocalManagedBlobStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.blobStore = new LocalManagedBlobStore(
      resolveManagedStorageRoot(config.get('MANAGED_STORAGE_ROOT', { infer: true })),
    );
  }

  async list(principal: AuthPrincipal, repositoryId: string, folderId?: string) {
    if (!(await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, { repositoryId, folderId }))) {
      // Traverse-only folders (on the way to a deeper grant) list no documents.
      const traversable = await this.authz.traversableFolderIds(principal, repositoryId, PERMISSIONS.DOCUMENTS_READ);
      const reachable = folderId ? traversable.has(folderId) : traversable.size > 0;
      if (!reachable) throw forbidden();
      return [];
    }
    const rows = await this.prisma.client.document.findMany({
      where: { repositoryId, folderId: folderId ?? null, lifecycleState: 'active' },
      orderBy: { displayName: 'asc' },
      include: { currentVersion: true },
    });
    return rows.map((row) => this.toListItem(row));
  }

  private toListItem(row: Prisma.DocumentGetPayload<{ include: { currentVersion: true } }>) {
    return {
      id: row.id,
      repositoryId: row.repositoryId,
      folderId: row.folderId,
      displayName: row.displayName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      currentVersion: row.currentVersion,
      source: row.sourceRelativePath
        ? {
            relativePath: row.sourceRelativePath,
            sizeBytes: row.sourceSizeBytes,
            modifiedAt: row.sourceModifiedAt,
            mimeType: row.sourceMimeType,
            scanStatus: row.sourceScanStatus,
          }
        : null,
    };
  }

  async upload(
    principal: AuthPrincipal,
    repositoryId: string,
    input: {
      folderId?: string;
      displayName: string;
      mimeType: string;
      stream: Readable;
    },
  ) {
    const repository = await this.prisma.client.repository.findUnique({
      where: { id: repositoryId },
      include: { storageConnection: true },
    });
    if (!repository || repository.status !== 'ACTIVE') {
      throw forbidden('Active repository required.');
    }
    if (repository.type === 'INDEXED') {
      return this.uploadIndexed(principal, repository, input);
    }
    return this.uploadManaged(principal, repositoryId, input);
  }

  async uploadManaged(
    principal: AuthPrincipal,
    repositoryId: string,
    input: {
      folderId?: string;
      displayName: string;
      mimeType: string;
      stream: Readable;
    },
  ) {
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, { repositoryId, folderId: input.folderId });

    const repository = await this.prisma.client.repository.findUnique({
      where: { id: repositoryId },
    });
    if (!repository || repository.type !== 'MANAGED' || repository.status !== 'ACTIVE') {
      throw forbidden('Managed active repository required.');
    }

    const storageDir = `quarantine/${repository.id}`;
    const published = await this.blobStore.publishStream(storageDir, input.stream);

    const session = await this.prisma.client.$transaction(async (tx) => {
      const storageObject = await tx.storageObject.create({
        data: {
          storageKey: published.storageKey,
          sha256: published.sha256,
          sizeBytes: BigInt(published.sizeBytes),
          mimeType: input.mimeType,
          scanStatus: 'pending',
        },
      });

      const uploadSession = await tx.uploadSession.create({
        data: {
          repositoryId,
          folderId: input.folderId,
          displayName: input.displayName,
          mimeType: input.mimeType,
          status: 'quarantine',
          storageObjectId: storageObject.id,
          createdByUserId: principal.id,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'upload_session',
          aggregateId: uploadSession.id,
          eventType: 'upload.scan_requested',
          payload: { uploadSessionId: uploadSession.id },
        },
      });

      return uploadSession;
    });

    await this.authz.writeAudit(
      principal,
      'document.upload.quarantine',
      'upload_session',
      session.id,
      'success',
      { repositoryId },
    );

    return {
      uploadSessionId: session.id,
      status: session.status,
      message: 'File accepted into quarantine; publication follows scan/index pipeline.',
    };
  }

  private async uploadIndexed(
    principal: AuthPrincipal,
    repository: Repository & { storageConnection: StorageConnection | null },
    input: {
      folderId?: string;
      displayName: string;
      mimeType: string;
      stream: Readable;
    },
  ) {
    await this.authz.assertCan(principal, PERMISSIONS.DOCUMENTS_WRITE, {
      repositoryId: repository.id,
      folderId: input.folderId,
    });

    const folder = input.folderId
      ? await this.prisma.client.folder.findFirst({
          where: { id: input.folderId, repositoryId: repository.id },
        })
      : null;
    if (input.folderId && !folder) {
      throw new NotFoundException('Folder not found.');
    }
    if (folder?.sourceMissingAt) {
      throw new BadRequestException('Folder is missing on the source.');
    }

    const base = input.displayName.replace(/\\/g, '/').split('/').pop() ?? '';
    let name: string;
    try {
      name = assertUsableSourceName(base, 'file');
    } catch (error) {
      if (error instanceof UnusableSourceNameError) throw new BadRequestException(error.message);
      throw error;
    }
    const relativePath = folder ? `${folder.relativePath}/${name}` : name;
    if (relativePath.length > 1024) {
      throw new BadRequestException('That path is too long.');
    }

    const staging = await mkdtemp(path.join(tmpdir(), 'intandms-indexed-upload-'));
    const staged = path.join(staging, 'payload');
    let scanStatus: 'clean' | 'skipped' = 'skipped';
    try {
      await pipeline(input.stream, createWriteStream(staged));
      const scan = await scanFileWithClamAv(staged);
      if (scan.status === 'infected') {
        throw forbidden('The file was rejected by the malware scanner.');
      }
      if (scan.status === 'skipped' && process.env.REQUIRE_CLAMAV === 'true') {
        throw new ServiceUnavailableException('Malware scanning is required before a file can be added to the source.');
      }
      if (scan.status === 'clean' || scan.status === 'skipped') {
        scanStatus = scan.status;
      }
      const scanRoot = await resolveIndexedScanRoot(this.prisma.client, repository);
      const written = await writeNewContainedFile(scanRoot, relativePath, createReadStream(staged));
      const mimeType = mimeTypeFromName(name);
      const fingerprint = sourceFingerprint(written.sizeBytes, written.modifiedAtMs);

      const created = await this.prisma.client.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            repositoryId: repository.id,
            folderId: folder?.id ?? null,
            displayName: name,
            sourceRelativePath: relativePath,
            sourceSizeBytes: BigInt(written.sizeBytes),
            sourceModifiedAt: new Date(written.modifiedAtMs),
            sourceMimeType: mimeType,
            sourceScanStatus: scanStatus,
            sourceScannedFingerprint: fingerprint,
          },
        });
        const session = await tx.uploadSession.create({
          data: {
            repositoryId: repository.id,
            folderId: folder?.id ?? null,
            displayName: name,
            mimeType,
            status: 'published',
            documentId: document.id,
            createdByUserId: principal.id,
            publishedAt: new Date(),
          },
        });
        return { document, session };
      });

      await this.authz.writeAudit(
        principal,
        'document.upload.indexed',
        'document',
        created.document.id,
        'success',
        { repositoryId: repository.id, sourceRelativePath: relativePath },
      );

      return {
        uploadSessionId: created.session.id,
        status: created.session.status,
        message: 'File written to the source.',
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A file with that name already exists.');
      }
      mapSourceWriteError(error);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async getUploadSession(principal: AuthPrincipal, uploadSessionId: string) {
    const session = await this.prisma.client.uploadSession.findUnique({
      where: { id: uploadSessionId },
    });
    const visible =
      session &&
      (session.createdByUserId === principal.id ||
        (await this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, {
          repositoryId: session.repositoryId,
          folderId: session.folderId,
        })));
    if (!session || !visible) {
      throw new NotFoundException('Upload session not found.');
    }
    return session;
  }

  async download(principal: AuthPrincipal, documentId: string): Promise<DocumentContent> {
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: {
        currentVersion: { include: { storageObject: true } },
      },
    });
    if (!document || !(await this.canRead(principal, document))) {
      throw new NotFoundException('Document not found.');
    }

    if (document.sourceRelativePath) {
      const content = await this.openIndexedSource(document);
      await this.authz.writeAudit(principal, 'document.download', 'document', document.id, 'success', { source: 'indexed' });
      return { displayName: document.displayName, ...content };
    }

    if (!document.currentVersion?.storageObject) {
      throw new NotFoundException('Document not found.');
    }
    if (document.currentVersion.storageObject.scanStatus !== 'clean') {
      throw forbidden('Document is not cleared for download.');
    }

    const bytes = await this.blobStore.readBytes(document.currentVersion.storageObject.storageKey);

    await this.authz.writeAudit(
      principal,
      'document.download',
      'document',
      document.id,
      'success',
    );

    return {
      displayName: document.displayName,
      mimeType: document.currentVersion.mimeType,
      body: bytes,
    };
  }

  /**
   * Opens an indexed file read-only, inside the repository root only, and only when the bytes are
   * still the ones the malware scan cleared (size and mtime of the open handle must match).
   */
  private async openIndexedSource(document: {
    repositoryId: string;
    sourceRelativePath: string | null;
    sourceMimeType: string | null;
    sourceScanStatus: string | null;
    sourceScannedFingerprint: string | null;
  }): Promise<{ mimeType: string; body: Readable }> {
    const cleared =
      document.sourceScanStatus === 'clean' || (document.sourceScanStatus === 'skipped' && process.env.REQUIRE_CLAMAV !== 'true');
    if (!cleared || !document.sourceScannedFingerprint) {
      throw forbidden('This file has not been cleared by the malware scan yet.');
    }
    const repository = await this.prisma.client.repository.findUnique({
      where: { id: document.repositoryId },
      include: { storageConnection: true },
    });
    const connectorId = (repository?.storageConnection.config as { connectorId?: string } | undefined)?.connectorId;
    const connector = connectorId ? await this.prisma.client.indexedConnector.findUnique({ where: { id: connectorId } }) : null;
    if (!repository || repository.status !== 'ACTIVE' || !connector?.mountPath || connector.status !== 'ACTIVE') {
      throw new ServiceUnavailableException('The storage source is not available.');
    }

    let handle: FileHandle;
    try {
      const root = await resolveContainedDirectory(connector.mountPath, repository.rootRelativePath);
      handle = await open(await resolveContainedFile(root, document.sourceRelativePath!), constants.O_RDONLY);
    } catch {
      throw new ServiceUnavailableException('The file is not reachable on the storage source.');
    }
    const current = await handle.stat();
    if (sourceFingerprint(current.size, current.mtimeMs) !== document.sourceScannedFingerprint) {
      await handle.close();
      throw new ConflictException('The file changed on the source since it was scanned. It will be available after the next index scan.');
    }
    return { mimeType: document.sourceMimeType ?? 'application/octet-stream', body: handle.createReadStream() };
  }

  async preview(principal: AuthPrincipal, documentId: string): Promise<{ mimeType: string; body: Buffer | Readable }> {
    const document = await this.prisma.client.document.findUnique({
      where: { id: documentId },
      include: { currentVersion: { include: { storageObject: true } } },
    });
    if (!document || !(await this.canRead(principal, document))) {
      throw new NotFoundException('Document not found.');
    }
    if (document.sourceRelativePath) {
      const mime = document.sourceMimeType ?? '';
      if (!isInlinePreviewable(mime)) throw new NotFoundException('Preview not available for this format yet.');
      return this.openIndexedSource(document);
    }
    if (!document.currentVersion?.storageObject) {
      throw new NotFoundException('Document not found.');
    }

    const artifact = await this.prisma.client.previewArtifact.findUnique({
      where: {
        documentVersionId_kind: {
          documentVersionId: document.currentVersion.id,
          kind: 'inline',
        },
      },
    });
    if (artifact) {
      const bytes = await this.blobStore.readBytes(artifact.storageKey);
      return { mimeType: artifact.mimeType, body: bytes };
    }

    const mime = document.currentVersion.mimeType;
    if (isInlinePreviewable(mime)) {
      const bytes = await this.blobStore.readBytes(document.currentVersion.storageObject.storageKey);
      return { mimeType: mime, body: bytes };
    }

    throw new NotFoundException('Preview not available for this format yet.');
  }

  /** Inaccessible documents answer 404 so their existence is not disclosed. */
  private canRead(principal: AuthPrincipal, document: { repositoryId: string; folderId: string | null; lifecycleState: string }) {
    if (document.lifecycleState !== 'active') return Promise.resolve(false);
    return this.authz.can(principal, PERMISSIONS.DOCUMENTS_READ, {
      repositoryId: document.repositoryId,
      folderId: document.folderId,
    });
  }
}
