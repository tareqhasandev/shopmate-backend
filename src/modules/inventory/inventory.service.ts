import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateInventoryAdjustmentDto,
  InventoryListQueryDto,
  UpdateInventoryDto,
} from './inventory.dto';

type InventoryProduct = {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
  inventory: {
    availableQuantity: number;
    reservedQuantity: number;
    updatedAt: Date;
  } | null;
};

type LockedProduct = { id: string; name: string; sku: string; isActive: boolean };

const MAX_QUANTITY = 2_147_483_647;

function toInventorySnapshot(product: InventoryProduct) {
  const availableQuantity = product.inventory?.availableQuantity ?? 0;
  const reservedQuantity = product.inventory?.reservedQuantity ?? 0;
  return {
    productId: product.id,
    product: { id: product.id, name: product.name, sku: product.sku, isActive: product.isActive },
    availableQuantity,
    reservedQuantity,
    sellableQuantity: availableQuantity - reservedQuantity,
    updatedAt: product.inventory?.updatedAt ?? null,
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string, query: InventoryListQueryDto) {
    const where = { storeId };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          isActive: true,
          inventory: { select: { availableQuantity: true, reservedQuantity: true, updatedAt: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: products.map((product) => toInventorySnapshot(product)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findByProduct(storeId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
      select: {
        id: true,
        name: true,
        sku: true,
        isActive: true,
        inventory: { select: { availableQuantity: true, reservedQuantity: true, updatedAt: true } },
      },
    });
    if (!product) throw new NotFoundException('Product inventory not found for this store');
    return toInventorySnapshot(product);
  }

  async availability(storeId: string, productId: string) {
    const inventory = await this.findByProduct(storeId, productId);
    const isAvailable = inventory.sellableQuantity > 0;
    return {
      ...inventory,
      isAvailable,
      status: isAvailable ? 'in_stock' : 'out_of_stock',
      message: isAvailable ? 'Product is available to sell.' : 'Product is out of stock.',
    };
  }

  async update(storeId: string, productId: string, input: UpdateInventoryDto) {
    const requestedAvailableQuantity = input.availableQuantity;
    if (requestedAvailableQuantity === undefined) {
      throw new BadRequestException('availableQuantity is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await this.lockProduct(tx, storeId, productId);
      const current = await tx.inventory.findUnique({ where: { productId } });
      const availableQuantity = requestedAvailableQuantity;
      const reservedQuantity = current?.reservedQuantity ?? 0;
      if (reservedQuantity > availableQuantity) {
        throw new ConflictException('availableQuantity cannot be lower than reservedQuantity');
      }

      const inventory = await tx.inventory.upsert({
        where: { productId },
        update: { availableQuantity },
        create: { productId, availableQuantity, reservedQuantity: 0 },
      });
      return toInventorySnapshot({ ...product, inventory });
    });
  }

  async adjust(storeId: string, productId: string, input: CreateInventoryAdjustmentDto) {
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('reason must not be empty');

    return this.prisma.$transaction(async (tx) => {
      const product = await this.lockProduct(tx, storeId, productId);
      const current = await tx.inventory.findUnique({ where: { productId } });
      const availableBefore = current?.availableQuantity ?? 0;
      const reservedQuantity = current?.reservedQuantity ?? 0;
      const availableAfter = availableBefore + input.quantityChange;
      if (availableAfter < 0 || availableAfter > MAX_QUANTITY || availableAfter < reservedQuantity) {
        throw new ConflictException(
          `Adjustment would violate stock limits; current sellable quantity is ${availableBefore - reservedQuantity}.`,
        );
      }

      const inventory = await tx.inventory.upsert({
        where: { productId },
        update: { availableQuantity: availableAfter },
        create: { productId, availableQuantity: availableAfter, reservedQuantity },
      });
      const adjustment = await tx.inventoryAdjustment.create({
        data: { productId, quantityChange: input.quantityChange, availableBefore, availableAfter, reservedQuantity, reason },
      });
      return { ...toInventorySnapshot({ ...product, inventory }), adjustment };
    });
  }

  private async lockProduct(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
  ): Promise<LockedProduct> {
    const products = await tx.$queryRaw<LockedProduct[]>(Prisma.sql`
      SELECT "id", "name", "sku", "is_active" AS "isActive"
      FROM "products"
      WHERE "id" = ${productId}::uuid AND "store_id" = ${storeId}::uuid
      FOR UPDATE
    `);
    const product = products[0];
    if (!product) throw new NotFoundException('Product inventory not found for this store');
    return product;
  }
}
