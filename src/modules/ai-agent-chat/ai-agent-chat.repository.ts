import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

export type ChatMessage = { role: 'user' | 'assistant'; content: string; createdAt: string };
export type AiConversation = {
  id: string;
  storeId: string;
  cartId: string | null;
  draftOrderId: string | null;
  messages: ChatMessage[];
};
type ConversationRow = { id: string; store_id: string; cart_id: string | null; draft_order_id: string | null; messages: unknown };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'assistant')) return [];
    if (typeof entry.content !== 'string' || typeof entry.createdAt !== 'string') return [];
    return [{ role: entry.role, content: entry.content, createdAt: entry.createdAt } as ChatMessage];
  }).slice(-24);
}
function toDomain(row: ConversationRow): AiConversation {
  return { id: row.id, storeId: row.store_id, cartId: row.cart_id, draftOrderId: row.draft_order_id, messages: readMessages(row.messages) };
}

@Injectable()
export class AiAgentChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string): Promise<AiConversation> {
    const id = randomUUID();
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ai_agent_conversations" ("id", "store_id", "messages")
      VALUES (${id}::uuid, ${storeId}::uuid, '[]'::jsonb)
    `);
    return { id, storeId, cartId: null, draftOrderId: null, messages: [] };
  }

  async findForStore(storeId: string, id: string): Promise<AiConversation | null> {
    const rows = await this.prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
      SELECT "id"::text, "store_id"::text, "cart_id"::text, "draft_order_id"::text, "messages"
      FROM "ai_agent_conversations"
      WHERE "id" = ${id}::uuid AND "store_id" = ${storeId}::uuid
      LIMIT 1
    `);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(conversation: AiConversation): Promise<void> {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ai_agent_conversations"
      SET "cart_id" = ${conversation.cartId}::uuid,
          "draft_order_id" = ${conversation.draftOrderId}::uuid,
          "messages" = ${JSON.stringify(conversation.messages)}::jsonb,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${conversation.id}::uuid AND "store_id" = ${conversation.storeId}::uuid
    `);
    if (count !== 1) throw new NotFoundException('Conversation not found');
  }
}
