-- CreateEnum
CREATE TYPE "RepositoryType" AS ENUM ('MANAGED', 'INDEXED');

-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "storage_connections" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "storage_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "description" TEXT,
    "type" "RepositoryType" NOT NULL,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "storage_connection_id" UUID NOT NULL,
    "root_relative_path" VARCHAR(512) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(256) NOT NULL,
    "relative_path" VARCHAR(1024) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "folder_id" UUID,
    "display_name" VARCHAR(512) NOT NULL,
    "lifecycle_state" VARCHAR(32) NOT NULL DEFAULT 'active',
    "current_version_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" UUID NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "storage_object_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "description" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_chunks" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text_content" TEXT NOT NULL,

    CONSTRAINT "search_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexed_connectors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "protocol" VARCHAR(16) NOT NULL,
    "host" VARCHAR(256) NOT NULL,
    "export_path" VARCHAR(512) NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_health_at" TIMESTAMPTZ(6),
    "last_health_note" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexed_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "rule" JSONB NOT NULL,
    "report_only" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_repository_id_parent_id_idx" ON "folders"("repository_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "folders_repository_id_relative_path_key" ON "folders"("repository_id", "relative_path");

-- CreateIndex
CREATE UNIQUE INDEX "documents_current_version_id_key" ON "documents"("current_version_id");

-- CreateIndex
CREATE INDEX "documents_repository_id_folder_id_idx" ON "documents"("repository_id", "folder_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_objects_storage_key_key" ON "storage_objects"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_sequence_key" ON "document_versions"("document_id", "sequence");

-- CreateIndex
CREATE INDEX "search_chunks_document_version_id_idx" ON "search_chunks"("document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "search_chunks_document_version_id_chunk_index_key" ON "search_chunks"("document_version_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_key_key" ON "workflow_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_key_key" ON "retention_policies"("key");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_storage_connection_id_fkey" FOREIGN KEY ("storage_connection_id") REFERENCES "storage_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_storage_object_id_fkey" FOREIGN KEY ("storage_object_id") REFERENCES "storage_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
