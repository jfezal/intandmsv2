-- AlterTable
ALTER TABLE "indexed_connectors" ADD COLUMN "smb_username" VARCHAR(256),
ADD COLUMN "mount_generation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "gateway_state" VARCHAR(32) NOT NULL DEFAULT 'unconfigured';
