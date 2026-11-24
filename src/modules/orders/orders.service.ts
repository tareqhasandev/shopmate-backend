import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DraftOrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateDraftOrderDto,
  OrderListQueryDto,
  UpdateDraftOrderDto,
  UpdateDraftOrderItemDto,
} from './dto/create-draft-order.dto';
import {
  assertSellableInventory,
  calculateDraftOrderAmounts,
  InventoryUnavailableError,
} from './order-pricing';

const ORDER_INCLUDE = {
  items: { orderBy: [{ productName: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.DraftOrderInclude;

type OrderWithItems = Prisma.DraftOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type LockedProduct = { id: string; isActive: boolean };

function presentOrder(order: OrderWithItems) {
  return {
    ...order,
    subtotal: order.subtotal.toFixed(2),
    discount: order.discount.toFixed(2),
    shippingCost: order.shippingCost.toFixed(2),
    total: order.total.toFixed(2),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    paymentStatus: 'NOT_PROCESSED' as const,
  };
}

function aggregateItems(items: Array<{ productId: string; quantity: number }>) {
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  for (const quantity of quantities.values()) {
    if (quantity > 100) throw new BadRequestException('A product quantity cannot exceed 100 per draft');
  }
  return quantities;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(storeId: string, dto: CreateDraftOrderDto) {
    if (Boolean(dto.cartId) === Boolean(dto.items?.length)) {
      throw new BadRequestException('Provide exactly one of cartId or a non-empty items array');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true, currency: true } });
        if (!store) throw new NotFoundException('Store not found');

        if (dto.customerId) await this.assertCustomer(tx, storeId, dto.customerId);

        let quantities: Map<string, number>;
        if (dto.cartId) {
          const cartRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "shopping_carts"
            WHERE "id" = ${dto.cartId}::uuid AND "store_id" = ${storeId}::uuid
            FOR UPDATE
          `);
          if (cartRows.length === 0) throw new NotFoundException('Cart not found in this store');
          const cart = await tx.shoppingCart.findFirst({
            where: { id: dto.cartId, storeId },
            select: { items: { select: { productId: true, quantity: true } } },
          });
          if (!cart || cart.items.length === 0) throw new BadRequestException('Cannot create an order from an empty cart');
          quantities = aggregateItems(cart.items);
        } else {
          quantities = aggregateItems(dto.items ?? []);
        }
        if (quantities.size === 0) throw new BadRequestException('At least one order item is required');

        const productIds = [...quantities.keys()].sort();
        await this.lockProducts(tx, storeId, productIds);
        const products = await tx.product.findMany({
          where: { id: { in: productIds }, storeId, isActive: true },
          include: { inventory: true },
        });
        if (products.length !== productIds.length) {
          throw new NotFoundException('One or more active products were not found in this store');
        }

        const productById = new Map(products.map((product) => [product.id, product]));
        const pricingInputs = [...quantities.entries()].map(([productId, quantity]) => {
          const product = productById.get(productId)!;
          if (!product.inventory) {
            throw new InventoryUnavailableError(`Inventory is not configured for ${product.name} (${product.sku}).`);
          }
          assertSellableInventory(
            product.inventory.availableQuantity,
            product.inventory.reservedQuantity,
            quantity,
          );
          return {
            productId,
            productName: product.name,
            sku: product.sku,
            unitPrice: product.price,
            quantity,
          };
        });
        const amounts = calculateDraftOrderAmounts(pricingInputs);
        const orderNumber = `SM-${Date.now().toString(36).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}`;

        const order = await tx.draftOrder.create({
          data: {
            storeId,
            customerId: dto.customerId,
            orderNumber,
            status: DraftOrderStatus.DRAFT,
            subtotal: amounts.subtotal,
            discount: amounts.discount,
            shippingCost: amounts.shippingCost,
            total: amounts.total,
            currency: store.currency,
            notes: dto.notes?.trim() || null,
            items: {
              create: amounts.items.map(({ productId, productName, sku, unitPrice, quantity, lineTotal }) => ({
                productId,
                productName,
                sku,
                unitPrice,
                quantity,
                lineTotal,
              })),
            },
          },
          include: ORDER_INCLUDE,
        });
        for (const item of pricingInputs) {
          await tx.inventory.update({
            where: { productId: item.productId },
            data: { reservedQuantity: { increment: item.quantity } },
          });
        }
        return presentOrder(order);
      });
    } catch (error) {
      if (error instanceof InventoryUnavailableError) throw new ConflictException(error.message);
      throw error;
    }
  }

  async list(storeId: string, query: OrderListQueryDto) {
    const where: Prisma.DraftOrderWhereInput = {
      storeId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.draftOrder.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.draftOrder.count({ where }),
    ]);
    return {
      items: orders.map(presentOrder),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findById(storeId: string, id: string) {
    const order = await this.prisma.draftOrder.findFirst({
      where: { id, storeId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found in this store');
    return presentOrder(order);
  }

  async updateDraft(storeId: string, id: string, input: UpdateDraftOrderDto) {
    if (Object.keys(input).length === 0) throw new BadRequestException('At least one draft field is required');
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, storeId, id);
      this.assertDraft(order);
      if (input.customerId) await this.assertCustomer(tx, storeId, input.customerId);

      const data: Prisma.DraftOrderUncheckedUpdateInput = {};
      if (input.customerId !== undefined) data.customerId = input.customerId;
      if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
      const updated = await tx.draftOrder.update({ where: { id }, data, include: ORDER_INCLUDE });
      return presentOrder(updated);
    });
  }

  async updateItem(storeId: string, orderId: string, itemId: string, input: UpdateDraftOrderItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, storeId, orderId);
      this.assertDraft(order);
      const item = await tx.draftOrderItem.findFirst({ where: { id: itemId, orderId } });
      if (!item) throw new NotFoundException('Order item not found in this draft');

      const products = await this.lockProducts(tx, storeId, [item.productId]);
      const product = products[0];
      if (!product) throw new ConflictException('The product reservation no longer matches this draft');
      const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
      if (!inventory || inventory.reservedQuantity < item.quantity) {
        throw new ConflictException('The draft reservation no longer matches current inventory');
      }
      const reservedByOthers = inventory.reservedQuantity - item.quantity;
      if (reservedByOthers < 0 || reservedByOthers > inventory.availableQuantity) {
        throw new ConflictException('The draft reservation no longer matches current inventory');
      }
      if (input.quantity > inventory.availableQuantity - reservedByOthers) {
        throw new ConflictException('Requested quantity exceeds current sellable stock');
      }
      if (input.quantity > item.quantity && !product.isActive) {
        throw new ConflictException('Inactive products cannot have their draft quantity increased');
      }

      const delta = input.quantity - item.quantity;
      if (delta !== 0) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reservedQuantity: delta > 0 ? { increment: delta } : { decrement: -delta } },
        });
      }
      await tx.draftOrderItem.update({
        where: { id: item.id },
        data: {
          quantity: input.quantity,
          lineTotal: item.unitPrice.mul(input.quantity).toDecimalPlaces(2),
        },
      });
      return this.recalculateOrder(tx, order);
    });
  }

  async removeItem(storeId: string, orderId: string, itemId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, storeId, orderId);
      this.assertDraft(order);
      const item = await tx.draftOrderItem.findFirst({ where: { id: itemId, orderId } });
      if (!item) throw new NotFoundException('Order item not found in this draft');

      await this.lockProducts(tx, storeId, [item.productId]);
      const inventory = await tx.inventory.findUnique({ where: { productId: item.productId } });
      if (!inventory || inventory.reservedQuantity < item.quantity) {
        throw new ConflictException('The draft reservation no longer matches current inventory');
      }
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { reservedQuantity: { decrement: item.quantity } },
      });
      await tx.draftOrderItem.delete({ where: { id: item.id } });
      return this.recalculateOrder(tx, order);
    });
  }

  async confirmDraft(storeId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, storeId, id);
      this.assertDraft(order);
      if (order.items.length === 0) throw new ConflictException('An empty draft cannot be confirmed');

      const quantities = this.orderQuantities(order.items);
      const productIds = [...quantities.keys()].sort();
      await this.lockProducts(tx, storeId, productIds);
      const inventoryRecords = await tx.inventory.findMany({ where: { productId: { in: productIds } } });
      const inventoryByProductId = new Map(inventoryRecords.map((record) => [record.productId, record]));
      for (const [productId, quantity] of quantities) {
        const inventory = inventoryByProductId.get(productId);
        if (!inventory || inventory.reservedQuantity < quantity || inventory.reservedQuantity > inventory.availableQuantity) {
          throw new ConflictException('The draft reservation no longer matches current inventory');
        }
      }

      const confirmed = await tx.draftOrder.update({
        where: { id },
        data: { status: DraftOrderStatus.CONFIRMED },
        include: ORDER_INCLUDE,
      });
      return presentOrder(confirmed);
    });
  }

  async cancelDraft(storeId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, storeId, id);
      this.assertDraft(order);
      const quantities = this.orderQuantities(order.items);
      const productIds = [...quantities.keys()].sort();
      await this.lockProducts(tx, storeId, productIds);
      const inventoryRecords = await tx.inventory.findMany({ where: { productId: { in: productIds } } });
      const inventoryByProductId = new Map(inventoryRecords.map((record) => [record.productId, record]));
      for (const [productId, quantity] of quantities) {
        const inventory = inventoryByProductId.get(productId);
        if (!inventory || inventory.reservedQuantity < quantity) {
          throw new ConflictException('The draft reservation no longer matches current inventory');
        }
      }

      await tx.draftOrder.update({ where: { id }, data: { status: DraftOrderStatus.CANCELLED } });
      for (const [productId, quantity] of quantities) {
        await tx.inventory.update({
          where: { productId },
          data: { reservedQuantity: { decrement: quantity } },
        });
      }
      const cancelled = await tx.draftOrder.findFirst({ where: { id, storeId }, include: ORDER_INCLUDE });
      if (!cancelled) throw new NotFoundException('Order not found in this store');
      return presentOrder(cancelled);
    });
  }

  private async recalculateOrder(tx: Prisma.TransactionClient, order: OrderWithItems) {
    const items = await tx.draftOrderItem.findMany({ where: { orderId: order.id }, orderBy: [{ productName: 'asc' }, { id: 'asc' }] });
    const amounts = calculateDraftOrderAmounts(
      items.map(({ productId, productName, sku, unitPrice, quantity }) => ({
        productId,
        productName,
        sku,
        unitPrice,
        quantity,
      })),
      order.discount,
      order.shippingCost,
    );
    await tx.draftOrder.update({
      where: { id: order.id },
      data: {
        subtotal: amounts.subtotal,
        discount: amounts.discount,
        shippingCost: amounts.shippingCost,
        total: amounts.total,
      },
    });
    const updated = await tx.draftOrder.findFirst({ where: { id: order.id }, include: ORDER_INCLUDE });
    if (!updated) throw new NotFoundException('Order not found in this store');
    return presentOrder(updated);
  }

  private async lockOrder(tx: Prisma.TransactionClient, storeId: string, id: string): Promise<OrderWithItems> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "draft_orders"
      WHERE "id" = ${id}::uuid AND "store_id" = ${storeId}::uuid
      FOR UPDATE
    `);
    if (rows.length === 0) throw new NotFoundException('Order not found in this store');
    const order = await tx.draftOrder.findFirst({ where: { id, storeId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found in this store');
    return order;
  }

  private async lockProducts(tx: Prisma.TransactionClient, storeId: string, productIds: string[]): Promise<LockedProduct[]> {
    if (productIds.length === 0) return [];
    return tx.$queryRaw<LockedProduct[]>(Prisma.sql`
      SELECT "id", "is_active" AS "isActive"
      FROM "products"
      WHERE "store_id" = ${storeId}::uuid
        AND "id" IN (${Prisma.join(productIds.map((productId) => Prisma.sql`${productId}::uuid`))})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  private async assertCustomer(tx: Prisma.TransactionClient, storeId: string, customerId: string) {
    const customer = await tx.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found in this store');
  }

  private assertDraft(order: OrderWithItems) {
    if (order.status !== DraftOrderStatus.DRAFT) {
      throw new ConflictException('Only DRAFT orders can be changed or cancelled');
    }
  }

  private orderQuantities(items: Array<{ productId: string; quantity: number }>) {
    const quantities = new Map<string, number>();
    for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    return quantities;
  }
}
