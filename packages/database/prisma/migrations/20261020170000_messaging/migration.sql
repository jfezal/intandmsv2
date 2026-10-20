-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP', 'DOCUMENT');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "title" VARCHAR(200),
    "direct_key" VARCHAR(80),
    "document_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "last_read_at" TIMESTAMPTZ(6),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_revisions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "replaced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_documents" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "document_id" UUID,

    CONSTRAINT "message_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_document_id_key" ON "conversations"("document_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_left_at_idx" ON "conversation_participants"("user_id", "left_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "message_revisions_message_id_idx" ON "message_revisions"("message_id");

-- CreateIndex
CREATE INDEX "message_documents_message_id_idx" ON "message_documents"("message_id");

-- CreateIndex
CREATE INDEX "message_documents_document_id_idx" ON "message_documents"("document_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_documents" ADD CONSTRAINT "message_documents_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_documents" ADD CONSTRAINT "message_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shape rules
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_key_required"
  CHECK (("kind" = 'DIRECT') = ("direct_key" IS NOT NULL));
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000);
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind" CHECK ("kind" IN ('text', 'system'));
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_role"
  CHECK ("role" IN ('owner', 'member', 'follower'));

-- D-16: messages are official records. Deletion is refused at the database, not only in the API;
-- revisions are append-only. Removing records requires an approved, out-of-band disposition procedure.
CREATE FUNCTION "refuse_message_record_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Message records are retained (D-16): % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "messages_no_delete" BEFORE DELETE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION "refuse_message_record_change"();
CREATE TRIGGER "message_revisions_append_only" BEFORE UPDATE OR DELETE ON "message_revisions"
  FOR EACH ROW EXECUTE FUNCTION "refuse_message_record_change"();

-- Investigation access to conversations
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'messages.audit', 'Read any conversation for an investigation; every access is audited.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."key" = 'messages.audit'
WHERE r."key" = 'auditor'
ON CONFLICT DO NOTHING;

UPDATE "roles" SET "description" = 'Read the audit log and investigate conversations system-wide.' WHERE "key" = 'auditor';

