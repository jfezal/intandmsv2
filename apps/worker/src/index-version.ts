import type { PrismaClient } from '@prisma/client';
import {
  convertToPdfWithLibreOffice,
  extractIndexText,
  isLibreOfficePreviewTarget,
  runTesseractOcr,
} from '@intandms/processing';
import type { LocalManagedBlobStore } from '@intandms/storage';

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
  blobStore: LocalManagedBlobStore,
  versionId: string,
  mimeType: string,
  storageKey: string,
  displayName?: string,
): Promise<void> {
  const inlinePreviewable =
    mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/');

  if (inlinePreviewable) {
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
    return;
  }

  if (!isLibreOfficePreviewTarget(mimeType, displayName)) {
    return;
  }

  const sourcePath = blobStore.absolutePath(storageKey);
  const converted = await convertToPdfWithLibreOffice(sourcePath);
  if (!converted.ok) {
    console.warn(`[preview] LibreOffice skipped for ${versionId}: ${converted.reason}`, converted.detail);
    return;
  }

  const previewKey = `derivatives/previews/${versionId}.pdf`;
  await blobStore.writeBytes(previewKey, converted.pdfBytes);

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
      storageKey: previewKey,
      mimeType: 'application/pdf',
    },
    update: { storageKey: previewKey, mimeType: 'application/pdf' },
  });
}
