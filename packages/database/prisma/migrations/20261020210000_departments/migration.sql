CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

CREATE TABLE "department_members" (
    "department_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "department_members_pkey" PRIMARY KEY ("department_id","user_id")
);

CREATE INDEX "department_members_user_id_idx" ON "department_members"("user_id");

ALTER TABLE "department_members" ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scoped_role_assignments" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "scoped_role_assignments" ADD COLUMN "department_id" UUID;

ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_subject_chk"
  CHECK (("user_id" IS NOT NULL AND "department_id" IS NULL) OR ("user_id" IS NULL AND "department_id" IS NOT NULL));

ALTER TABLE "scoped_role_assignments" ADD CONSTRAINT "scoped_role_assignments_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "scoped_role_assignments_repo_grant_key";
DROP INDEX IF EXISTS "scoped_role_assignments_folder_grant_key";

CREATE UNIQUE INDEX "scoped_role_assignments_user_repo_grant_key"
  ON "scoped_role_assignments" ("user_id", "role_id", "repository_id")
  WHERE "user_id" IS NOT NULL AND "folder_id" IS NULL;

CREATE UNIQUE INDEX "scoped_role_assignments_user_folder_grant_key"
  ON "scoped_role_assignments" ("user_id", "role_id", "folder_id")
  WHERE "user_id" IS NOT NULL AND "folder_id" IS NOT NULL;

CREATE UNIQUE INDEX "scoped_role_assignments_dept_repo_grant_key"
  ON "scoped_role_assignments" ("department_id", "role_id", "repository_id")
  WHERE "department_id" IS NOT NULL AND "folder_id" IS NULL;

CREATE UNIQUE INDEX "scoped_role_assignments_dept_folder_grant_key"
  ON "scoped_role_assignments" ("department_id", "role_id", "folder_id")
  WHERE "department_id" IS NOT NULL AND "folder_id" IS NOT NULL;

CREATE INDEX "scoped_role_assignments_department_id_repository_id_idx"
  ON "scoped_role_assignments"("department_id", "repository_id");
