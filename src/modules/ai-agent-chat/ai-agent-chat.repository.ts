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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessages(value: Prisma.JsonValue): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'assistant')) return [];
    if (typeof entry.content !== 'string' || typeof entry.createdAt !== 'string') return [];
    return [{ role: entry.role, content: entry.content, createdAt: entry.createdAt } as ChatMessage];
  }).slice(-24);
}

@Injectable()
export class AiAgentChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string): Promise<AiConversation> {
    const row = await this.prisma.aiAgentConversation.create({
      data: { id: randomUUID(), storeId, messages: [] },
    });
    return this.toDomain(row);
  }

  async findForStore(storeId: string, id: string): Promise<AiConversation | null> {
    const row = await this.prisma.aiAgentConversation.findFirst({ where: { id, storeId } });
    return row ? this.toDomain(row) : null;
  }

  async save(conversation: AiConversation): Promise<void> {
    const result = await this.prisma.aiAgentConversation.updateMany({
      where: { id: conversation.id, storeId: conversation.storeId },
      data: {
        cartId: conversation.cartId,
        draftOrderId: conversation.draftOrderId,
        messages: conversation.messages as Prisma.InputJsonValue,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Conversation not found');
  }

  private toDomain(row: {
    id: string; storeId: string; cartId: string | null; draftOrderId: string | null; messages: Prisma.JsonValue;
  }): AiConversation {
    return {
      id: row.id,
      storeId: row.storeId,
      cartId: row.cartId,
      draftOrderId: row.draftOrderId,
      messages: readMessages(row.messages),
    };
  }
}
