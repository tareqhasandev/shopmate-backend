import { Injectable } from '@nestjs/common';
import type { CommerceToolName } from './commerce-tool.registry';

export const AI_AGENT_PLANNER = 'AI_AGENT_PLANNER';
export type ProductTarget = 'add_to_cart' | 'update_cart' | 'remove_from_cart' | 'check_stock' | 'get_product_details';
export type ChatPlan =
  | { kind: 'reply'; text: string }
  | { kind: 'tool'; name: CommerceToolName; arguments: Record<string, unknown> }
  | { kind: 'product'; query: string; target: ProductTarget; quantity?: number }
  | { kind: 'cart_update'; quantity: number };

export interface AiAgentPlanner {
  plan(message: string): ChatPlan;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function cleanQuery(value: string): string {
  return value.trim().replace(/[?.!,]+$/g, '').replace(/\s+/g, ' ').slice(0, 100);
}

@Injectable()
export class DeterministicChatPlanner implements AiAgentPlanner {
  plan(rawMessage: string): ChatPlan {
    const message = rawMessage.trim();
    const lower = message.toLowerCase();
    const id = message.match(UUID)?.[0];

    if (/\b(should i|would it be okay|maybe|thinking about|considering)\b/.test(lower) && /\b(add|order|buy)\b/.test(lower)) {
      return { kind: 'reply', text: 'I can help with that. Would you like me to make the change now, or would you prefer more product information first?' };
    }
    if (/\b(update|change|edit)\b.*\bdraft order\b/.test(lower)) {
      const notes = message.match(/\bnotes?\s*[:=]\s*([\s\S]+)$/i)?.[1];
      return notes
        ? { kind: 'tool', name: 'update_draft_order', arguments: { notes: cleanQuery(notes) } }
        : { kind: 'reply', text: 'Tell me the draft-order note you want to change, for example: “Update the draft order notes: deliver after 5pm.”' };
    }
    if (/\b(create|prepare|make)\b.*\b(draft\s+)?order\b/.test(lower) || /\bcreate draft order\b/.test(lower)) {
      return { kind: 'tool', name: 'create_draft_order', arguments: {} };
    }
    if (/\b(draft order|order status|my order)\b/.test(lower) && /\b(show|get|view|check|status|where)\b/.test(lower)) {
      return { kind: 'tool', name: 'get_draft_order', arguments: {} };
    }

    const add = message.match(/\badd\s+([\s\S]+?)\s+(?:to|in)\s+(?:my\s+)?cart\b/i);
    if (add) {
      const raw = add[1].trim();
      const quantityMatch = raw.match(/^(\d+)\s*(?:x\s*|of\s+)?(.*)$/i);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const query = cleanQuery(quantityMatch?.[2] ?? raw);
      if (id) return { kind: 'tool', name: 'add_to_cart', arguments: { productId: id, quantity } };
      return query ? { kind: 'product', query, target: 'add_to_cart', quantity } : { kind: 'reply', text: 'Which product would you like to add?' };
    }

    const remove = message.match(/\bremove\s+([\s\S]+?)\s+from\s+(?:my\s+)?cart\b/i);
    if (remove) {
      if (id) return { kind: 'tool', name: 'remove_from_cart', arguments: { productId: id } };
      return { kind: 'product', query: cleanQuery(remove[1]), target: 'remove_from_cart' };
    }

    const update = message.match(/\b(?:update|set|change)\s+(?:the\s+)?(?:(?:quantity|qty)\s+(?:of\s+)?)?([\s\S]+?)\s+to\s+(\d+)\b/i);
    if (update && /\b(cart|quantity|qty)\b/i.test(message)) {
      const quantity = Number(update[2]);
      const query = cleanQuery(update[1].replace(/\b(cart|quantity|qty|item)\b/ig, ''));
      if (id) return { kind: 'tool', name: 'update_cart', arguments: { productId: id, quantity } };
      return query ? { kind: 'product', query, target: 'update_cart', quantity } : { kind: 'cart_update', quantity };
    }

    if (/\b(show|get|view|open)\b.*\bcart\b|\bwhat(?:'s| is) in my cart\b/.test(lower)) {
      return { kind: 'tool', name: 'get_cart', arguments: {} };
    }
    if (/\b(create|start|open)\b.*\bcart\b/.test(lower)) {
      return { kind: 'tool', name: 'create_cart', arguments: {} };
    }
    if (/\b(recommend|recommendation|suggest)\b/.test(lower)) {
      const query = cleanQuery(message.replace(/\b(please\s+)?(recommend|recommendations?|suggest|suggestions?)\b/ig, '').replace(/\b(for me|something|some products|products)\b/ig, ''));
      return { kind: 'tool', name: 'get_recommendations', arguments: { ...(query ? { query } : {}), limit: 5 } };
    }
    if (/\b(stock|availability|available)\b/.test(lower)) {
      if (id) return { kind: 'tool', name: 'check_stock', arguments: { productId: id } };
      const query = cleanQuery(message.replace(/\b(check|stock|availability|available|for|of|the|is|there|any|in stock)\b/ig, ''));
      return query ? { kind: 'product', query, target: 'check_stock' } : { kind: 'reply', text: 'Which product should I check for current stock?' };
    }
    if (/\b(details|specs|specifications|tell me about)\b/.test(lower)) {
      if (id) return { kind: 'tool', name: 'get_product_details', arguments: { productId: id } };
      const query = cleanQuery(message.replace(/\b(show|get|details|specs|specifications|tell me about|for|the)\b/ig, ''));
      return query ? { kind: 'product', query, target: 'get_product_details' } : { kind: 'reply', text: 'Which product would you like details about?' };
    }
    if (/\b(search|find|show|looking for|look for|do you have)\b/.test(lower)) {
      const query = cleanQuery(message.replace(/\b(search|find|show me|show|looking for|look for|do you have|please)\b/ig, ''));
      return { kind: 'tool', name: 'search_products', arguments: { ...(query ? { query } : {}), limit: 10 } };
    }
    return { kind: 'reply', text: 'I can search products, check availability, recommend items, manage a cart, and prepare or update a draft order. Tell me what you would like to do.' };
  }
}
