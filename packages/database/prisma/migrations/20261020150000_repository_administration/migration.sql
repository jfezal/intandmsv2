-- Indexing schedule (NULL = manual scans only)
ALTER TABLE "repositories" ADD COLUMN "scan_interval_minutes" INTEGER;
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_scan_interval_check"
  CHECK ("scan_interval_minutes" IS NULL OR "scan_interval_minutes" >= 15);

-- Scan health
ALTER TABLE "scan_checkpoints" ADD COLUMN "last_started_at" TIMESTAMPTZ(6);
ALTER TABLE "scan_checkpoints" ADD COLUMN "last_completed_at" TIMESTAMPTZ(6);
ALTER TABLE "scan_checkpoints" ADD COLUMN "last_error" VARCHAR(1024);
ALTER TABLE "scan_checkpoints" ADD COLUMN "files_seen" INTEGER NOT NULL DEFAULT 0;
