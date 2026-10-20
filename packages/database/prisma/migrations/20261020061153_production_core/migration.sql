-- AlterTable
ALTER TABLE "indexed_connectors" ADD COLUMN     "mount_path" VARCHAR(512);

-- AlterTable
ALTER TABLE "storage_objects" ADD COLUMN     "scan_status" VARCHAR(32) NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "scoped_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "repository_id" UUID,
    "folder_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoped_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "folder_id" UUID,
    "display_name" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'quarantine',
    "storage_object_id" UUID,
    "document_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_observations" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "relative_path" VARCHAR(1024) NOT NULL,
    "sha256" VARCHAR(64),
    "size_bytes" BIGINT,
    "source_state" VARCHAR(32) NOT NULL DEFAULT 'discovered',
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scan_generation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "source_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_checkpoints" (
    "id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "frontier_path" VARCHAR(1024),
    "status" VARCHAR(32) NOT NULL DEFAULT 'idle',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'in_progress',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tasks" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "step_key" VARCHAR(64) NOT NULL,
    "assignee_user_id" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "decision" VARCHAR(32),
    "comment" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_assignments" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "reason" VARCHAR(512) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_artifacts" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scoped_role_assignments_user_id_repository_id_idx" ON "scoped_role_assignments"("user_id", "repository_id");

-- CreateIndex
CREATE INDEX "upload_sessions_status_created_at_idx" ON "upload_sessions"("status", "created_at");

-- CreateIndex
CREATE INDEX "source_observations_repository_id_source_state_idx" ON "source_observations"("repository_id", "source_state");

-- CreateIndex
CREATE UNIQUE INDEX "source_observations_repository_id_relative_path_key" ON "source_observations"("repository_id", "relative_path");

-- CreateIndex
CREATE UNIQUE INDEX "scan_checkpoints_repository_id_key" ON "scan_checkpoints"("repository_id");

-- CreateIndex
CREATE INDEX "workflow_instances_document_id_idx" ON "workflow_instances"("document_id");

-- CreateIndex
CREATE INDEX "workflow_tasks_assignee_user_id_status_idx" ON "workflow_tasks"("assignee_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_assignments_policy_id_repository_id_key" ON "retention_assignments"("policy_id", "repository_id");

-- CreateIndex
CREATE INDEX "legal_holds_document_id_active_idx" ON "legal_holds"("document_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "preview_artifacts_document_version_id_kind_key" ON "preview_artifacts"("document_version_id", "kind");

-- AddForeignKey
ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_storage_object_id_fkey" FOREIGN KEY ("storage_object_id") REFERENCES "storage_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_observations" ADD CONSTRAINT "source_observations_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_checkpoints" ADD CONSTRAINT "scan_checkpoints_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_assignments" ADD CONSTRAINT "retention_assignments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "retention_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "retention_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
