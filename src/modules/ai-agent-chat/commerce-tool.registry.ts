import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ProductsService } from '../products/products.service';
import { ProductQueryDto } from '../products/dto/product-query.dto';
import { InventoryService } from '../inventory/inventory.service';
import { CartService } from '../cart/cart.service';
import { AddCartItemDto, CreateCartDto, UpdateCartItemDto } from '../cart/cart.dto';
import { OrdersService } from '../orders/orders.service';
import { CreateDraftOrderDto, UpdateDraftOrderDto, UpdateDraftOrderItemDto } from '../orders/dto/create-draft-order.dto';
import { AiConversation } from './ai-agent-chat.repository';

export const COMMERCE_TOOL_NAMES = [
  'search_products', 'get_product_details', 'get_recommendations', 'check_stock',
  'create_cart', 'add_to_cart', 'update_cart', 'remove_from_cart', 'get_cart',
  'create_draft_order', 'update_draft_order', 'get_draft_order',
] as const;
export type CommerceToolName = (typeof COMMERCE_TOOL_NAMES)[number];
type JsonSchema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export type CommerceToolDefinition = { name: CommerceToolName; description: string; inputSchema: JsonSchema };
const objectSchema = (properties: Record<string, unknown> = {}, required?: string[]): JsonSchema => ({ type: 'object', properties, ...(required?.length ? { required } : {}), additionalProperties: false });
const str = (description: string, maxLength = 200) => ({ type: 'string', description, maxLength });
const integer = (description: string, minimum = 1, maximum = 100) => ({ type: 'integer', description, minimum, maximum });

export const COMMERCE_TOOL_DEFINITIONS: CommerceToolDefinition[] = [
  { name: 'search_products', description: 'Search current catalog data for this store.', inputSchema: objectSchema({ query: str('Keywords', 100), category: str('Category slug', 140), brand: str('Brand', 120), minPrice: str('Minimum price', 20), maxPrice: str('Maximum price', 20), inStock: { type: 'boolean' }, limit: integer('Maximum results', 1, 20) }) },
  { name: 'get_product_details', description: 'Read one active product by store-local UUID or slug.', inputSchema: objectSchema({ productId: str('Product UUID or slug') }, ['productId']) },
  { name: 'get_recommendations', description: 'Return a deterministic in-stock shortlist from this store catalog; not model-personalized.', inputSchema: objectSchema({ query: str('Keywords', 100), category: str('Category slug', 140), brand: str('Brand', 120), maxPrice: str('Maximum price', 20), limit: integer('Maximum results', 1, 10) }) },
  { name: 'check_stock', description: 'Check current sellable inventory for a store product.', inputSchema: objectSchema({ productId: str('Product UUID', 36) }, ['productId']) },
  { name: 'create_cart', description: 'Create an empty cart and attach it to this conversation.', inputSchema: objectSchema() },
  { name: 'add_to_cart', description: 'Add a product using its database price and validated stock.', inputSchema: objectSchema({ productId: str('Product UUID', 36), quantity: integer('Quantity') }, ['productId', 'quantity']) },
  { name: 'update_cart', description: 'Set a cart line total quantity using the conversation cart.', inputSchema: objectSchema({ productId: str('Product UUID', 36), quantity: integer('New total quantity') }, ['productId', 'quantity']) },
  { name: 'remove_from_cart', description: 'Remove a product line from the current conversation cart.', inputSchema: objectSchema({ productId: str('Product UUID', 36) }, ['productId']) },
  { name: 'get_cart', description: 'Read the current conversation cart and service-calculated totals.', inputSchema: objectSchema() },
  { name: 'create_draft_order', description: 'Create a draft from this conversation cart; existing service rules reserve stock. No payment is taken.', inputSchema: objectSchema() },
  { name: 'update_draft_order', description: 'Update notes or a line quantity on the current draft order.', inputSchema: objectSchema({ notes: str('Replacement notes', 2000), productId: str('Product UUID for a quantity change', 36), quantity: integer('New line quantity') }) },
  { name: 'get_draft_order', description: 'Read the draft order associated with this conversation.', inputSchema: objectSchema() },
];

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw new BadRequestException('Tool arguments must be an object'); return value; }
function stringArg(value: unknown, key: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`Invalid ${key}`);
  return value.trim();
}
function quantityArg(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) throw new BadRequestException('Quantity must be an integer from 1 to 100');
  return value;
}
function priceArg(value: unknown, key: string): string {
  const price = stringArg(value, key, 20);
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(price)) throw new BadRequestException(`Invalid ${key}`);
  return price;
}
function asRecord(value: unknown): Record<string, unknown> | null { return isRecord(value) ? value : null; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

@Injectable()
export class CommerceToolRegistry {
  readonly names = COMMERCE_TOOL_NAMES;
  readonly definitions = COMMERCE_TOOL_DEFINITIONS;
  constructor(
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly carts: CartService,
    private readonly orders: OrdersService,
  ) {}

  validateCall(name: string, input: unknown): { name: CommerceToolName; arguments: Record<string, unknown> } {
    if (!(COMMERCE_TOOL_NAMES as readonly string[]).includes(name)) throw new BadRequestException('Unknown commerce tool');
    const toolName = name as CommerceToolName;
    const args = record(input);
    const allow = (keys: string[]) => {
      const unexpected = Object.keys(args).find((key) => !keys.includes(key));
      if (unexpected) throw new BadRequestException(`Unexpected argument: ${unexpected}`);
    };
    const uuid = (value: unknown) => {
      if (typeof value !== 'string' || !isUUID(value, '4')) throw new BadRequestException('productId must be a UUID');
      return value;
    };
    switch (toolName) {
      case 'search_products': case 'get_recommendations': {
        const isRecommendation = toolName === 'get_recommendations';
        const keys = isRecommendation ? ['query', 'category', 'brand', 'maxPrice', 'limit'] : ['query', 'category', 'brand', 'minPrice', 'maxPrice', 'inStock', 'limit'];
        allow(keys);
        const result: Record<string, unknown> = {};
        for (const key of ['query', 'category', 'brand'] as const) if (args[key] !== undefined) result[key] = stringArg(args[key], key, key === 'query' ? 100 : 140);
        if (args.minPrice !== undefined) result.minPrice = priceArg(args.minPrice, 'minPrice');
        if (args.maxPrice !== undefined) result.maxPrice = priceArg(args.maxPrice, 'maxPrice');
        if (args.inStock !== undefined) {
          if (typeof args.inStock !== 'boolean') throw new BadRequestException('inStock must be a boolean');
          result.inStock = args.inStock;
        }
        if (args.limit !== undefined) {
          const max = isRecommendation ? 10 : 20;
          if (typeof args.limit !== 'number' || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > max) throw new BadRequestException(`limit must be an integer from 1 to ${max}`);
          result.limit = args.limit;
        }
        return { name: toolName, arguments: result };
      }
      case 'get_product_details':
        allow(['productId']); return { name: toolName, arguments: { productId: stringArg(args.productId, 'productId', 200) } };
      case 'check_stock': case 'remove_from_cart':
        allow(['productId']); return { name: toolName, arguments: { productId: uuid(args.productId) } };
      case 'add_to_cart': case 'update_cart':
        allow(['productId', 'quantity']); return { name: toolName, arguments: { productId: uuid(args.productId), quantity: quantityArg(args.quantity) } };
      case 'update_draft_order': {
        allow(['notes', 'productId', 'quantity']);
        const result: Record<string, unknown> = {};
        if (args.notes !== undefined) result.notes = stringArg(args.notes, 'notes', 2000);
        if (args.productId !== undefined) result.productId = uuid(args.productId);
        if (args.quantity !== undefined) result.quantity = quantityArg(args.quantity);
        if ((result.productId === undefined) !== (result.quantity === undefined) || (result.notes === undefined && result.productId === undefined)) throw new BadRequestException('Provide notes or both productId and quantity');
        return { name: toolName, arguments: result };
      }
      case 'create_cart': case 'get_cart': case 'create_draft_order': case 'get_draft_order':
        allow([]); return { name: toolName, arguments: {} };
    }
  }

  async execute(storeId: string, conversation: AiConversation, name: string, input: unknown): Promise<unknown> {
    const call = this.validateCall(name, input);
    const args = call.arguments;
    switch (call.name) {
      case 'search_products': {
        const q: ProductQueryDto = {
          ...(args.query ? { search: args.query as string } : {}),
          ...(args.category ? { category: args.category as string } : {}),
          ...(args.brand ? { brand: args.brand as string } : {}),
          ...(args.minPrice ? { min_price: args.minPrice as string } : {}),
          ...(args.maxPrice ? { max_price: args.maxPrice as string } : {}),
          ...(args.inStock !== undefined ? { in_stock: args.inStock as boolean } : {}),
          page: 1, limit: (args.limit as number | undefined) ?? 10,
        };
        return this.products.list(storeId, q);
      }
      case 'get_product_details': return this.products.findById(storeId, args.productId as string);
      case 'get_recommendations': return this.products.list(storeId, {
        ...(args.query ? { search: args.query as string } : {}),
        ...(args.category ? { category: args.category as string } : {}),
        ...(args.brand ? { brand: args.brand as string } : {}),
        ...(args.maxPrice ? { max_price: args.maxPrice as string } : {}),
        in_stock: true, sort_by: 'price', sort_order: 'asc', page: 1, limit: (args.limit as number | undefined) ?? 5,
      });
      case 'check_stock': return this.inventory.availability(storeId, args.productId as string);
      case 'create_cart': {
        const cart = await this.carts.create(storeId, { items: [] } as CreateCartDto);
        conversation.cartId = String((cart as { id: string }).id);
        return cart;
      }
      case 'add_to_cart': {
        if (!conversation.cartId) throw new NotFoundException('No cart attached to conversation');
        return this.carts.addItem(storeId, conversation.cartId, { productId: args.productId, quantity: args.quantity } as AddCartItemDto);
      }
      case 'update_cart': case 'remove_from_cart': {
        if (!conversation.cartId) throw new NotFoundException('No cart attached to conversation');
        const cart = await this.carts.findById(storeId, conversation.cartId);
        const item = asArray(asRecord(cart)?.items).map(asRecord).find((entry) => entry?.productId === args.productId);
        if (!item || typeof item.id !== 'string') throw new NotFoundException('Product is not in this cart');
        return call.name === 'update_cart'
          ? this.carts.updateItem(storeId, conversation.cartId, item.id, { quantity: args.quantity } as UpdateCartItemDto)
          : this.carts.removeItem(storeId, conversation.cartId, item.id);
      }
      case 'get_cart':
        if (!conversation.cartId) throw new NotFoundException('No cart attached to conversation');
        return this.carts.findById(storeId, conversation.cartId);
      case 'create_draft_order': {
        if (!conversation.cartId) throw new NotFoundException('No cart attached to conversation');
        const order = await this.orders.createDraft(storeId, { cartId: conversation.cartId } as CreateDraftOrderDto);
        conversation.draftOrderId = String((order as { id: string }).id);
        return order;
      }
      case 'update_draft_order': {
        if (!conversation.draftOrderId) throw new NotFoundException('No draft order attached to conversation');
        let result: unknown;
        if (args.notes !== undefined) result = await this.orders.updateDraft(storeId, conversation.draftOrderId, { notes: args.notes as string } as UpdateDraftOrderDto);
        if (args.productId !== undefined) {
          const order = result ?? await this.orders.findById(storeId, conversation.draftOrderId);
          const item = asArray(asRecord(order)?.items).map(asRecord).find((entry) => entry?.productId === args.productId);
          if (!item || typeof item.id !== 'string') throw new NotFoundException('Product is not in this draft order');
          result = await this.orders.updateItem(storeId, conversation.draftOrderId, item.id, { quantity: args.quantity } as UpdateDraftOrderItemDto);
        }
        return result;
      }
      case 'get_draft_order':
        if (!conversation.draftOrderId) throw new NotFoundException('No draft order attached to conversation');
        return this.orders.findById(storeId, conversation.draftOrderId);
    }
  }
}
