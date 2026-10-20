-- Indexed repositories project source files into documents/folders without copying or modifying the source.

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "source_mime_type" VARCHAR(128),
ADD COLUMN     "source_modified_at" TIMESTAMPTZ(6),
ADD COLUMN     "source_relative_path" VARCHAR(1024),
ADD COLUMN     "source_scan_status" VARCHAR(32),
ADD COLUMN     "source_scanned_fingerprint" VARCHAR(64),
ADD COLUMN     "source_size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "source_missing_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "source_observations" ADD COLUMN     "modified_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "documents_repository_id_source_relative_path_key" ON "documents"("repository_id", "source_relative_path");

ALTER TABLE "documents" ADD CONSTRAINT "documents_source_scan_status_check"
  CHECK ("source_scan_status" IS NULL OR "source_scan_status" IN ('pending', 'clean', 'skipped', 'infected', 'failed'));

-- A projected document never carries managed versions, and a managed document never carries a source path.
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_or_version_check"
  CHECK ("source_relative_path" IS NULL OR "current_version_id" IS NULL);
