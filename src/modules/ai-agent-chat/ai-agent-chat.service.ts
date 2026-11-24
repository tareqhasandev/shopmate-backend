import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiAgentChatRequestDto, AiAgentChatResponseDto } from './dto/ai-agent-chat.dto';
import { AiAgentChatRepository, AiConversation } from './ai-agent-chat.repository';
import { AI_AGENT_PLANNER, AiAgentPlanner, ChatPlan, ProductTarget } from './ai-agent-chat.planner';
import { CommerceToolRegistry, CommerceToolName } from './commerce-tool.registry';

type ToolExecution = { name: string; status: 'succeeded' | 'failed' };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function asRecord(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return value === undefined || value === null ? '' : String(value); }

@Injectable()
export class AiAgentChatService {
  private readonly logger = new Logger(AiAgentChatService.name);
  constructor(
    private readonly conversations: AiAgentChatRepository,
    private readonly tools: CommerceToolRegistry,
    @Inject(AI_AGENT_PLANNER) private readonly planner: AiAgentPlanner,
  ) {}

  async handle(storeId: string, input: AiAgentChatRequestDto): Promise<AiAgentChatResponseDto> {
    const conversation = input.conversationId
      ? await this.conversations.findForStore(storeId, input.conversationId)
      : await this.conversations.create(storeId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    const message = input.message.trim();
    conversation.messages.push({ role: 'user', content: message, createdAt: new Date().toISOString() });
    const executions: ToolExecution[] = [];
    let reply: string;
    try { reply = await this.fulfill(storeId, conversation, this.planner.plan(message), executions); }
    catch (error) {
      const type = error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.warn(`AI chat tool execution failed (${type})`);
      reply = 'I could not complete that action with the current store information. Please check the product or cart details and try again.';
    }
    conversation.messages.push({ role: 'assistant', content: reply, createdAt: new Date().toISOString() });
    conversation.messages = conversation.messages.slice(-24);
    await this.conversations.save(conversation);
    return { conversationId: conversation.id, reply, mode: 'deterministic_fallback', toolExecutions: executions };
  }

  private async fulfill(storeId: string, conversation: AiConversation, plan: ChatPlan, executions: ToolExecution[]): Promise<string> {
    if (plan.kind === 'reply') return plan.text;
    if (plan.kind === 'product') return this.resolveProduct(storeId, conversation, plan.query, plan.target, plan.quantity, executions);
    if (plan.kind === 'cart_update') {
      if (!conversation.cartId) return 'You do not have a cart in this conversation yet. Create one or add a product first.';
      const cart = await this.runTool(storeId, conversation, 'get_cart', {}, executions);
      const items = asArray(asRecord(cart).items);
      if (items.length !== 1) return items.length === 0 ? 'Your cart is empty. Add a product before changing its quantity.' : 'Which cart item should I update? Please name the product.';
      const productId = text(asRecord(items[0]).productId);
      return this.describe('update_cart', await this.runTool(storeId, conversation, 'update_cart', { productId, quantity: plan.quantity }, executions));
    }
    if (plan.name === 'get_cart' && !conversation.cartId) return 'You do not have a cart in this conversation yet. Ask me to create one or add a product.';
    if (plan.name === 'create_draft_order' && !conversation.cartId) return 'Add products to a cart first, then I can prepare a draft order for review.';
    if (plan.name === 'get_draft_order' && !conversation.draftOrderId) return 'There is no draft order attached to this conversation yet.';
    if (plan.name === 'update_draft_order' && !conversation.draftOrderId) return 'There is no draft order attached to this conversation yet. Create one from your cart first.';
    if ((plan.name === 'update_cart' || plan.name === 'remove_from_cart') && !conversation.cartId) return 'Create a cart and add a product before changing its contents.';
    const result = await this.runTool(storeId, conversation, plan.name, plan.arguments, executions);
    return this.describe(plan.name, result);
  }

  private async resolveProduct(
    storeId: string, conversation: AiConversation, query: string, target: ProductTarget,
    quantity: number | undefined, executions: ToolExecution[],
  ): Promise<string> {
    if (target === 'update_cart' || target === 'remove_from_cart') {
      if (!conversation.cartId) return 'Create a cart and add a product before changing its contents.';
    }
    if (target === 'update_draft_order' && !conversation.draftOrderId) return 'There is no draft order attached to this conversation yet. Create one from your cart first.';
    const search = await this.runTool(storeId, conversation, 'search_products', { query, limit: 10 }, executions);
    const items = asArray(asRecord(search).items).map(asRecord);
    if (!items.length) return `I could not find an active product matching “${query}”. Try another name or keyword.`;
    if (items.length > 1) {
      const choices = items.slice(0, 5).map((item) => `• ${text(item.name)}${item.price !== undefined ? ` — ${text(item.price)}` : ''}`).join('\n');
      return `I found several matches. Which one did you mean?\n${choices}`;
    }
    const productId = text(items[0].id);
    if (!productId) return 'I found a match but could not identify it safely. Please try another product search.';
    if (target === 'add_to_cart' && !conversation.cartId) await this.runTool(storeId, conversation, 'create_cart', {}, executions);
    const args = target === 'add_to_cart' || target === 'update_cart' || target === 'update_draft_order'
      ? { productId, quantity: quantity ?? 1 }
      : { productId };
    return this.describe(target, await this.runTool(storeId, conversation, target, args, executions));
  }

  private async runTool(storeId: string, conversation: AiConversation, name: CommerceToolName, args: Record<string, unknown>, executions: ToolExecution[]): Promise<unknown> {
    try {
      const result = await this.tools.execute(storeId, conversation, name, args);
      executions.push({ name, status: 'succeeded' });
      return result;
    } catch (error) {
      executions.push({ name, status: 'failed' });
      throw error;
    }
  }

  private describe(name: CommerceToolName, value: unknown): string {
    const result = asRecord(value);
    if (name === 'search_products' || name === 'get_recommendations') {
      const items = asArray(result.items).map(asRecord);
      if (!items.length) return 'I did not find matching active products in this store. Try another search or adjust the filters.';
      const lines = items.slice(0, 10).map((item) => `• ${text(item.name)} — ${text(item.price)}${item.brand ? ` (${text(item.brand)})` : ''}`);
      return `${name === 'get_recommendations' ? 'Here are a few in-stock options' : `I found ${items.length} product${items.length === 1 ? '' : 's'}`}:\n${lines.join('\n')}`;
    }
    if (name === 'get_product_details') return `${text(result.name)}${result.price !== undefined ? ` — ${text(result.price)}` : ''}${result.description ? `\n${text(result.description)}` : ''}`;
    if (name === 'check_stock') return `${text(result.message) || 'Current inventory checked.'} Sellable quantity: ${text(result.sellableQuantity)}.`;
    if (name === 'create_cart') return 'I created a new cart for this conversation. What would you like to add?';
    if (name === 'add_to_cart') return `Added the product to your cart. Current subtotal: ${text(result.subtotal)} ${text(result.currency)}.`;
    if (name === 'update_cart') return `Updated your cart. Current subtotal: ${text(result.subtotal)} ${text(result.currency)}.`;
    if (name === 'remove_from_cart') return `Removed the product from your cart. Current subtotal: ${text(result.subtotal)} ${text(result.currency)}.`;
    if (name === 'get_cart') {
      const lines = asArray(result.items).map((entry) => { const item = asRecord(entry); return `• ${text(asRecord(item.product).name)} × ${text(item.quantity)} — ${text(item.lineTotal)}`; });
      return lines.length ? `Your cart has ${text(result.itemCount)} item(s):\n${lines.join('\n')}\nSubtotal: ${text(result.subtotal)} ${text(result.currency)}.` : 'Your cart is empty.';
    }
    if (name === 'create_draft_order') return `Draft order ${text(result.orderNumber) || text(result.id)} is ready for review. Total: ${text(result.total)} ${text(result.currency)}. No payment was taken.`;
    if (name === 'update_draft_order') return `Updated draft order ${text(result.orderNumber) || text(result.id)}. Total: ${text(result.total)} ${text(result.currency)}.`;
    if (name === 'get_draft_order') return `Draft order ${text(result.orderNumber) || text(result.id)} is ${text(result.status)}. Total: ${text(result.total)} ${text(result.currency)}. No payment has been taken.`;
    return 'The requested commerce action is complete.';
  }
}
