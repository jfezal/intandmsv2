-- Role metadata
ALTER TABLE "roles" ADD COLUMN "description" TEXT,
ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

UPDATE "roles" SET "is_system" = true WHERE "key" = 'system_admin';

-- Scoped grants (D-03): every grant belongs to a repository; folder grants also name the folder.
ALTER TABLE "scoped_role_assignments" ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "scoped_role_assignments"
  ADD CONSTRAINT "scoped_role_assignments_repository_required" CHECK ("repository_id" IS NOT NULL);

-- Partial unique indexes are not expressible in schema.prisma; keep them when diffing future migrations.
CREATE UNIQUE INDEX "scoped_role_assignments_repo_grant_key"
  ON "scoped_role_assignments" ("user_id", "role_id", "repository_id")
  WHERE "folder_id" IS NULL;

CREATE UNIQUE INDEX "scoped_role_assignments_folder_grant_key"
  ON "scoped_role_assignments" ("user_id", "role_id", "folder_id")
  WHERE "folder_id" IS NOT NULL;

CREATE INDEX "scoped_role_assignments_folder_id_idx" ON "scoped_role_assignments" ("folder_id");
CREATE INDEX "folders_parent_id_idx" ON "folders" ("parent_id");

-- Permission catalog
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'system.admin', 'Full system administration, including all repositories.'),
  (gen_random_uuid(), 'users.manage', 'Create and manage users, roles and access grants.'),
  (gen_random_uuid(), 'audit.read', 'Read the audit log.'),
  (gen_random_uuid(), 'repositories.manage', 'Create, configure and disable repositories.'),
  (gen_random_uuid(), 'connectors.manage', 'Manage storage connections and credentials.'),
  (gen_random_uuid(), 'jobs.manage', 'Inspect and control background processing.'),
  (gen_random_uuid(), 'documents.read', 'View, preview and download documents.'),
  (gen_random_uuid(), 'documents.write', 'Upload documents, create folders and start reviews.'),
  (gen_random_uuid(), 'search.query', 'Use search; results stay limited to readable documents.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Suggested, customizable role bundles
INSERT INTO "roles" ("id", "key", "display_name", "description") VALUES
  (gen_random_uuid(), 'viewer', 'Viewer', 'Read and search documents where granted.'),
  (gen_random_uuid(), 'contributor', 'Contributor', 'Read, upload and organise documents where granted.'),
  (gen_random_uuid(), 'auditor', 'Auditor', 'Read the audit log system-wide.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON
  (r."key" = 'viewer' AND p."key" IN ('documents.read', 'search.query'))
  OR (r."key" = 'contributor' AND p."key" IN ('documents.read', 'documents.write', 'search.query'))
  OR (r."key" = 'auditor' AND p."key" IN ('audit.read'))
ON CONFLICT DO NOTHING;
