ALTER TABLE "workflow_definitions" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workflow_definitions" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "workflow_instances" ADD COLUMN "definition_snapshot" JSONB NOT NULL DEFAULT '{"steps":[]}';
ALTER TABLE "workflow_instances" ADD COLUMN "assignees" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "workflow_instances_document_id_status_idx" ON "workflow_instances"("document_id", "status");
