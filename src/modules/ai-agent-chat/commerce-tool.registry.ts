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

const objectSchema = (properties: Record<string, unknown> = {}, required?: string[]): JsonSchema => ({
  type: 'object', properties, ...(required?.length ? { required } : {}), additionalProperties: false,
});
const stringProp = (description: string, maxLength = 200) => ({ type: 'string', description, maxLength });
const integerProp = (description: string, minimum = 1, maximum = 100) => ({ type: 'integer', description, minimum, maximum });

export const COMMERCE_TOOL_DEFINITIONS: CommerceToolDefinition[] = [
  { name: 'search_products', description: 'Search this store catalog using its current product and inventory data.', inputSchema: objectSchema({ query: stringProp('Keywords'), category: stringProp('Category slug', 140), brand: stringProp('Brand', 120), minPrice: stringProp('Minimum price', 20), maxPrice: stringProp('Maximum price', 20), inStock: { type: 'boolean' }, limit: integerProp('Maximum results', 1, 20) }) },
  { name: 'get_product_details', description: 'Read one active product by store-local UUID or slug.', inputSchema: objectSchema({ productId: stringProp('Product UUID or slug', 200) }, ['productId']) },
  { name: 'get_recommendations', description: 'Return a deterministic, in-stock shortlist from the store catalog; this is not personalized model ranking.', inputSchema: objectSchema({ query: stringProp('Optional keywords'), category: stringProp('Category slug', 140), brand: stringProp('Brand', 120), maxPrice: stringProp('Maximum price', 20), limit: integerProp('Maximum results', 1, 10) }) },
  { name: 'check_stock', description: 'Read current sellable inventory for a product in the selected store.', inputSchema: objectSchema({ productId: stringProp('Product UUID', 36) }, ['productId']) },
  { name: 'create_cart', description: 'Create an empty cart in the selected store and attach it to this conversation.', inputSchema: objectSchema() },
  { name: 'add_to_cart', description: 'Add a product using its current database price and validated stock.', inputSchema: objectSchema({ productId: stringProp('Product UUID', 36), quantity: integerProp('Quantity', 1, 100) }, ['productId', 'quantity']) },
  { name: 'update_cart', description: 'Set a cart line total quantity; store, cart and product are validated server-side.', inputSchema: objectSchema({ productId: stringProp('Product UUID', 36), quantity: integerProp('New total quantity', 1, 100) }, ['productId', 'quantity']) },
  { name: 'remove_from_cart', description: 'Remove a product line from this conversation’s current cart.', inputSchema: objectSchema({ productId: stringProp('Product UUID', 36) }, ['productId']) },
  { name: 'get_cart', description: 'Read this conversation’s current cart and totals calculated by the commerce service.', inputSchema: objectSchema() },
  { name: 'create_draft_order', description: 'Create a draft order from this conversation’s cart. The existing order service validates prices and reserves stock; no payment is taken.', inputSchema: objectSchema() },
  { name: 'update_draft_order', description: 'Update notes or one item quantity on this conversation’s draft order; only draft orders can be changed.', inputSchema: objectSchema({ notes: stringProp('Replacement notes', 2000), productId: stringProp('Product UUID for a quantity change', 36), quantity: integerProp('New order-line quantity', 1, 100) }) },
  { name: 'get_draft_order', description: 'Read the draft order associated with this conversation.', inputSchema: objectSchema() },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException('Tool arguments must be an object');
  return value;
}
function readString(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`Invalid ${name}`);
  return value.trim();
}
function readQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) throw new BadRequestException('Quantity must be an integer from 1 to 100');
  return value;
}
function readPrice(value: unknown, name: string): string {
  const price = readString(value, name, 20);
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(price)) throw new BadRequestException(`Invalid ${name}`);
  return price;
}
function asRecord(value: unknown): Record<string, unknown> | null { return isRecord(value) ? value : null; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

@Injectable()
export class CommerceToolRegistry {
  readonly definitions = COMMERCE_TOOL_DEFINITIONS;
  readonly names = COMMERCE_TOOL_NAMES;

  constructor(
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly carts: CartService,
    private readonly orders: OrdersService,
  ) {}

  validateCall(name: string, input: unknown): { name: CommerceToolName; arguments: Record<string, unknown> } {
    if (!(COMMERCE_TOOL_NAMES as readonly string[]).includes(name)) throw new BadRequestException('Unknown commerce tool');
    const args = record(input);
    const common = (allowed: string[]) => {
      const unexpected = Object.keys(args).find((key) => !allowed.includes(key));
      if (unexpected) throw new BadRequestException(`Unexpected argument: ${unexpected}`);
    };
    switch (name as CommerceToolName) {
      case 'search_products': {
        common(['query', 'category', 'brand', 'minPrice', 'maxPrice', 'inStock', 'limit']);
        const result: Record<string, unknown> = {};
        for (const key of ['query', 'category', 'brand'] as const) if (args[key] !== undefined) result[key] = readString(args[key], key, key === 'query' ? 100 : 140);
        for (const key of ['minPrice', 'maxPrice'] as const) if (args[key] !== undefined) result[key] = readPrice(args[key], key);
        if (args.inStock !== undefined) {
          if (typeof args.inStock !== 'boolean') throw new BadRequestException('inStock must be a boolean');
          result.inStock = args.inStock;
        }
        if (args.limit !== undefined) {
          if (typeof args.limit !== 'number' || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) throw new BadRequestException('limit must be an integer from 1 to 20');
          result.limit = args.limit;
        }
        return { name, arguments: result };
      }
      case 'get_recommendations': {
        common(['query', 'category', 'brand', 'maxPrice', 'limit']);
        const result: Record<string, unknown> = {};
        for (const key of ['query', 'category', 'brand'] as const) if (args[key] !== undefined) result[key] = readString(args[key], key, key === 'query' ? 100 : 140);
        if (args.maxPrice !== undefined) result.maxPrice = readPrice(args.maxPrice, 'maxPrice');
        if (args.limit !== undefined) {
          if (typeof args.limit !== 'number' || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 10) throw new BadRequestException('limit must be an integer from 1 to 10');
          result.limit = args.limit;
        }
        return { name, arguments: result };
      }
      case 'get_product_details': {
        common(['productId']); return { name, arguments: { productId: readString(args.productId, 'productId', 200) } };
      }
      case 'check_stock': case 'remove_from_cart': {
        common(['productId']);
        if (typeof args.productId !== 'string' || !isUUID(args.productId, '4')) throw new BadRequestException('productId must be a UUID');
        return { name, arguments: { productId: args.productId } };
      }
      case 'add_to_cart': case 'update_cart': {
        common(['productId', 'quantity']);
        if (typeof args.productId !== 'string' || !isUUID(args.productId, '4')) throw new BadRequestException('productId must be a UUID');
        return { name, arguments: { productId: args.productId, quantity: readQuantity(args.quantity) } };
      }
      case 'update_draft_order': {
        common(['notes', 'productId', 'quantity']);
        const result: Record<string, unknown> = {};
        if (args.notes !== undefined) result.notes = readString(args.notes, 'notes', 2000);
        if (args.productId !== undefined) {
          if (typeof args.productId !== 'string' || !isUUID(args.productId, '4')) throw new BadRequestException('productId must be a UUID');
          result.productId = args.productId;
        }
        if (args.quantity !== undefined) result.quantity = readQuantity(args.quantity);
        if ((result.productId === undefined) !== (result.quantity === undefined) || (result.notes === undefined && result.productId === undefined)) {
          throw new BadRequestException('Provide notes or both productId and quantity');
        }
        return { name, arguments: result };
      }
      case 'create_cart': case 'get_cart': case 'create_draft_order': case 'get_draft_order':
        common([]); return { name, arguments: {} };
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
      case 'get_recommendations': {
        const q: ProductQueryDto = {
          ...(args.query ? { search: args.query as string } : {}),
          ...(args.category ? { category: args.category as string } : {}),
          ...(args.brand ? { brand: args.brand as string } : {}),
          ...(args.maxPrice ? { max_price: args.maxPrice as string } : {}),
          in_stock: true, sort_by: 'price', sort_order: 'asc', page: 1, limit: (args.limit as number | undefined) ?? 5,
        };
        return this.products.list(storeId, q);
      }
      case 'check_stock': return this.inventory.availability(storeId, args.productId as string);
      case 'create_cart': {
        const cart = await this.carts.create(storeId, { items: [] } as CreateCartDto);
        conversation.cartId = String((cart as { id: string }).id);
        return cart;
      }
      case 'add_to_cart': {
        if (!conversation.cartId) throw new NotFoundException('Create a cart before adding items');
        return this.carts.addItem(storeId, conversation.cartId, { productId: args.productId, quantity: args.quantity } as AddCartItemDto);
      }
      case 'update_cart': case 'remove_from_cart': {
        if (!conversation.cartId) throw new NotFoundException('No cart is attached to this conversation');
        const cart = await this.carts.findById(storeId, conversation.cartId);
        const item = asArray(asRecord(cart)?.items).map(asRecord).find((entry) => entry?.productId === args.productId);
        if (!item || typeof item.id !== 'string') throw new NotFoundException('Product is not in this cart');
        return call.name === 'update_cart'
          ? this.carts.updateItem(storeId, conversation.cartId, item.id, { quantity: args.quantity } as UpdateCartItemDto)
          : this.carts.removeItem(storeId, conversation.cartId, item.id);
      }
      case 'get_cart': {
        if (!conversation.cartId) throw new NotFoundException('No cart is attached to this conversation');
        return this.carts.findById(storeId, conversation.cartId);
      }
      case 'create_draft_order': {
        if (!conversation.cartId) throw new NotFoundException('Create and fill a cart before preparing an order');
        const order = await this.orders.createDraft(storeId, { cartId: conversation.cartId } as CreateDraftOrderDto);
        conversation.draftOrderId = String((order as { id: string }).id);
        return order;
      }
      case 'update_draft_order': {
        if (!conversation.draftOrderId) throw new NotFoundException('No draft order is attached to this conversation');
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
      case 'get_draft_order': {
        if (!conversation.draftOrderId) throw new NotFoundException('No draft order is attached to this conversation');
        return this.orders.findById(storeId, conversation.draftOrderId);
      }
    }
  }
}
