CREATE TABLE "ai_agent_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "store_id" UUID NOT NULL,
  "cart_id" UUID,
  "draft_order_id" UUID,
  "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_agent_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_agent_conversations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ai_agent_conversations_store_id_updated_at_idx"
  ON "ai_agent_conversations" ("store_id", "updated_at");
