import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto, CreateCartDto, UpdateCartItemDto } from './cart.dto';

const CART_INCLUDE = {
  store: { select: { currency: true } },
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          imageUrl: true,
          price: true,
          isActive: true,
          inventory: { select: { availableQuantity: true, reservedQuantity: true } },
        },
      },
    },
  },
} satisfies Prisma.ShoppingCartInclude;

type CartRecord = Prisma.ShoppingCartGetPayload<{ include: typeof CART_INCLUDE }>;
type CartProduct = {
  id: string;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  isActive: boolean;
  inventory: { availableQuantity: number; reservedQuantity: number } | null;
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, input: CreateCartDto) {
    const quantities = this.aggregate(input.items ?? []);
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!store) throw new NotFoundException('Store not found');

      const products = await this.lockAndValidateProducts(tx, storeId, quantities);
      const cart = await tx.shoppingCart.create({
        data: {
          storeId,
          items: {
            create: [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity })),
          },
        },
        select: { id: true },
      });
      return this.readCart(tx, storeId, cart.id, products);
    });
  }

  async findById(storeId: string, cartId: string) {
    return this.prisma.$transaction((tx) => this.readCart(tx, storeId, cartId));
  }

  async addItem(storeId: string, cartId: string, input: AddCartItemDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, storeId, cartId);
      const existing = await tx.shoppingCartItem.findUnique({
        where: { cartId_productId: { cartId, productId: input.productId } },
        select: { quantity: true },
      });
      const quantity = (existing?.quantity ?? 0) + input.quantity;
      if (quantity > 100) throw new BadRequestException('A product quantity cannot exceed 100 per cart');

      const quantities = new Map([[input.productId, quantity]]);
      const products = await this.lockAndValidateProducts(tx, storeId, quantities);
      await tx.shoppingCartItem.upsert({
        where: { cartId_productId: { cartId, productId: input.productId } },
        update: { quantity },
        create: { cartId, productId: input.productId, quantity },
      });
      await this.touchCart(tx, cartId);
      return this.readCart(tx, storeId, cartId, products);
    });
  }

  async updateItem(storeId: string, cartId: string, itemId: string, input: UpdateCartItemDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, storeId, cartId);
      const item = await tx.shoppingCartItem.findFirst({
        where: { id: itemId, cartId },
        select: { id: true, productId: true },
      });
      if (!item) throw new NotFoundException('Cart item not found');

      const products = await this.lockAndValidateProducts(tx, storeId, new Map([[item.productId, input.quantity]]));
      await tx.shoppingCartItem.update({ where: { id: item.id }, data: { quantity: input.quantity } });
      await this.touchCart(tx, cartId);
      return this.readCart(tx, storeId, cartId, products);
    });
  }

  async removeItem(storeId: string, cartId: string, itemId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, storeId, cartId);
      const item = await tx.shoppingCartItem.findFirst({ where: { id: itemId, cartId }, select: { id: true } });
      if (!item) throw new NotFoundException('Cart item not found');
      await tx.shoppingCartItem.delete({ where: { id: item.id } });
      await this.touchCart(tx, cartId);
      return this.readCart(tx, storeId, cartId);
    });
  }

  async remove(storeId: string, cartId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, storeId, cartId);
      await tx.shoppingCart.delete({ where: { id: cartId } });
      return { cartId, deleted: true };
    });
  }

  private aggregate(items: Array<{ productId: string; quantity: number }>) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
      if (quantity > 100) throw new BadRequestException('A product quantity cannot exceed 100 per cart');
      quantities.set(item.productId, quantity);
    }
    return quantities;
  }

  private async lockAndValidateProducts(
    tx: Prisma.TransactionClient,
    storeId: string,
    quantities: Map<string, number>,
  ): Promise<Map<string, CartProduct>> {
    const productIds = [...quantities.keys()].sort();
    if (productIds.length === 0) return new Map();

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "products"
      WHERE "store_id" = ${storeId}::uuid
        AND "id" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id"
      FOR UPDATE
    `);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        isActive: true,
        inventory: { select: { availableQuantity: true, reservedQuantity: true } },
      },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more active products were not found in this store');
    }

    const byId = new Map(products.map((product) => [product.id, product]));
    for (const [productId, quantity] of quantities) {
      const product = byId.get(productId)!;
      const available = product.inventory?.availableQuantity ?? 0;
      const reserved = product.inventory?.reservedQuantity ?? 0;
      const sellable = available - reserved;
      if (quantity > sellable) {
        throw new ConflictException(
          `Out of stock: ${product.name} (${product.sku}) has ${sellable} sellable unit(s); ${quantity} requested.`,
        );
      }
    }
    return byId;
  }

  private async touchCart(tx: Prisma.TransactionClient, cartId: string) {
    await tx.shoppingCart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  private async lockCart(tx: Prisma.TransactionClient, storeId: string, cartId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "shopping_carts"
      WHERE "id" = ${cartId}::uuid AND "store_id" = ${storeId}::uuid
      FOR UPDATE
    `);
    if (rows.length === 0) throw new NotFoundException('Cart not found in this store');
  }

  private async readCart(
    tx: Prisma.TransactionClient,
    storeId: string,
    cartId: string,
    lockedProducts?: Map<string, CartProduct>,
  ) {
    const cart = await tx.shoppingCart.findFirst({ where: { id: cartId, storeId }, include: CART_INCLUDE });
    if (!cart) throw new NotFoundException('Cart not found in this store');
    const items = cart.items.map((item) => {
      const product = lockedProducts?.get(item.productId) ?? item.product;
      const availableQuantity = product.inventory?.availableQuantity ?? 0;
      const reservedQuantity = product.inventory?.reservedQuantity ?? 0;
      const sellableQuantity = availableQuantity - reservedQuantity;
      const lineTotal = product.price.mul(item.quantity);
      return {
        id: item.id,
        productId: item.productId,
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: item.product.imageUrl,
          isActive: product.isActive,
        },
        quantity: item.quantity,
        availableQuantity,
        reservedQuantity,
        sellableQuantity,
        isAvailable: product.isActive && sellableQuantity >= item.quantity,
        unitPrice: product.price.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });
    const subtotal = items.reduce((total, item) => total.plus(item.lineTotal), new Prisma.Decimal(0));
    return {
      id: cart.id,
      currency: cart.store.currency.trim(),
      items,
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      subtotal: subtotal.toFixed(2),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }
}
