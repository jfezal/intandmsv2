import type { PrismaClient } from '@prisma/client';
import { extractIndexText, runTesseractOcr } from '@intandms/processing';
import { LocalManagedBlobStore } from '@intandms/storage';

export async function indexDocumentVersion(
  db: PrismaClient,
  blobStore: LocalManagedBlobStore,
  versionId: string,
  mimeTypeHint?: string,
): Promise<void> {
  const version = await db.documentVersion.findUnique({
    where: { id: versionId },
    include: { storageObject: true },
  });
  if (!version?.storageObject) {
    return;
  }

  const mimeType = mimeTypeHint ?? version.mimeType;
  const absolutePath = blobStore.absolutePath(version.storageObject.storageKey);
  let text = await extractIndexText(absolutePath, mimeType, version.sha256);

  const ocrText = await runTesseractOcr(absolutePath);
  if (ocrText) {
    text = `${text}\n${ocrText}`.slice(0, 64_000);
  }

  await db.searchChunk.upsert({
    where: {
      documentVersionId_chunkIndex: {
        documentVersionId: version.id,
        chunkIndex: 0,
      },
    },
    create: {
      documentVersionId: version.id,
      chunkIndex: 0,
      textContent: text,
    },
    update: { textContent: text },
  });
}

export async function ensurePreviewArtifact(
  db: PrismaClient,
  versionId: string,
  mimeType: string,
  storageKey: string,
): Promise<void> {
  const previewable =
    mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/');
  if (!previewable) {
    return;
  }

  await db.previewArtifact.upsert({
    where: {
      documentVersionId_kind: {
        documentVersionId: versionId,
        kind: 'inline',
      },
    },
    create: {
      documentVersionId: versionId,
      kind: 'inline',
      storageKey,
      mimeType,
    },
    update: { storageKey, mimeType },
  });
}
