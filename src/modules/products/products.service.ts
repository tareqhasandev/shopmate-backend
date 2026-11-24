import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/create-product.dto';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  inventory: { select: { availableQuantity: true, reservedQuantity: true } },
} satisfies Prisma.ProductInclude;

type CatalogProduct = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

type CatalogOptions = {
  categorySlug?: string;
  featured?: boolean;
};

function withInventory(product: CatalogProduct) {
  return {
    ...product,
    inventory: product.inventory
      ? {
          availableQuantity: product.inventory.availableQuantity,
          reservedQuantity: product.inventory.reservedQuantity,
          sellableQuantity: product.inventory.availableQuantity - product.inventory.reservedQuantity,
        }
      : { availableQuantity: 0, reservedQuantity: 0, sellableQuantity: 0 },
  };
}

function makeSlug(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `product-${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string, query: ProductQueryDto) {
    return this.listCatalog(storeId, query);
  }

  search(storeId: string, query: ProductQueryDto) {
    if (!query.search?.trim()) throw new BadRequestException('search is required');
    return this.listCatalog(storeId, query);
  }

  featured(storeId: string, query: ProductQueryDto) {
    return this.listCatalog(storeId, query, { featured: true });
  }

  async categories(storeId: string) {
    const categories = await this.prisma.category.findMany({
      where: { storeId, products: { some: { isActive: true } } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      items: categories.map(({ _count, ...category }) => ({ ...category, productCount: _count.products })),
    };
  }

  async byCategory(storeId: string, slug: string, query: ProductQueryDto) {
    return this.listCatalog(storeId, query, { categorySlug: slug });
  }

  async findById(storeId: string, id: string) {
    // Keep the Phase 1 slug lookup working while making UUID IDs the documented contract.
    const where: Prisma.ProductWhereInput = isUUID(id)
      ? { id, storeId, isActive: true }
      : { slug: id, storeId, isActive: true };
    const product = await this.prisma.product.findFirst({ where, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('Product not found');
    return withInventory(product);
  }

  async create(storeId: string, input: CreateProductDto) {
    const selectedCategory = await this.prisma.category.findFirst({
      where: { id: input.categoryId, storeId },
      select: { id: true },
    });
    if (!selectedCategory) throw new NotFoundException('Category not found for this store');

    const product = await this.prisma.product.create({
      data: {
        storeId,
        categoryId: selectedCategory.id,
        name: input.name.trim(),
        slug: input.slug?.trim() || makeSlug(input.name),
        description: input.description,
        sku: input.sku.trim(),
        price: new Prisma.Decimal(input.price),
        compareAtPrice: input.compareAtPrice == null ? null : new Prisma.Decimal(input.compareAtPrice),
        brand: input.brand.trim(),
        imageUrl: input.imageUrl,
        specifications: (input.specifications ?? {}) as Prisma.InputJsonValue,
        tags: (input.tags ?? []) as Prisma.InputJsonValue,
        isActive: true,
        isFeatured: input.isFeatured ?? false,
        inventory: {
          create: { availableQuantity: input.initialStock ?? 0, reservedQuantity: 0 },
        },
      },
      include: PRODUCT_INCLUDE,
    });
    return withInventory(product);
  }

  async update(storeId: string, id: string, input: UpdateProductDto) {
    if (Object.keys(input).length === 0) throw new BadRequestException('At least one product field is required');

    return this.prisma.$transaction(async (tx) => {
      if (input.availableQuantity !== undefined) {
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "products"
          WHERE "id" = ${id}::uuid AND "store_id" = ${storeId}::uuid
          FOR UPDATE
        `);
      }
      const existing = await tx.product.findFirst({ where: { id, storeId } });
      if (!existing) throw new NotFoundException('Product not found');

      if (input.categoryId) {
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, storeId },
          select: { id: true },
        });
        if (!category) throw new NotFoundException('Category not found for this store');
      }

      if (input.availableQuantity !== undefined) {
        const currentInventory = await tx.inventory.findUnique({ where: { productId: id } });
        if (currentInventory && input.availableQuantity < currentInventory.reservedQuantity) {
          throw new BadRequestException('availableQuantity cannot be lower than reservedQuantity');
        }
      }

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (input.categoryId !== undefined) data.categoryId = input.categoryId;
      if (input.name !== undefined) data.name = input.name.trim();
      if (input.slug !== undefined) data.slug = input.slug.trim();
      if (input.description !== undefined) data.description = input.description;
      if (input.sku !== undefined) data.sku = input.sku.trim();
      if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
      if (input.compareAtPrice !== undefined) {
        data.compareAtPrice = input.compareAtPrice === null ? null : new Prisma.Decimal(input.compareAtPrice);
      }
      if (input.brand !== undefined) data.brand = input.brand.trim();
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
      if (input.specifications !== undefined) data.specifications = input.specifications as Prisma.InputJsonValue;
      if (input.tags !== undefined) data.tags = input.tags as Prisma.InputJsonValue;
      if (input.isFeatured !== undefined) data.isFeatured = input.isFeatured;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      await tx.product.update({ where: { id }, data });
      if (input.availableQuantity !== undefined) {
        await tx.inventory.upsert({
          where: { productId: id },
          update: { availableQuantity: input.availableQuantity },
          create: { productId: id, availableQuantity: input.availableQuantity, reservedQuantity: 0 },
        });
      }

      const updated = await tx.product.findFirst({ where: { id, storeId }, include: PRODUCT_INCLUDE });
      if (!updated) throw new NotFoundException('Product not found');
      return withInventory(updated);
    });
  }

  async deactivate(storeId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id, storeId, isActive: true } });
      if (!product) throw new NotFoundException('Product not found');
      const deactivated = await tx.product.update({
        where: { id },
        data: { isActive: false, isFeatured: false },
        include: PRODUCT_INCLUDE,
      });
      return withInventory(deactivated);
    });
  }

  private async listCatalog(storeId: string, query: ProductQueryDto, options: CatalogOptions = {}) {
    if (query.min_price && query.max_price && new Prisma.Decimal(query.min_price).gt(query.max_price)) {
      throw new BadRequestException('min_price must be less than or equal to max_price');
    }

    const categorySlug = options.categorySlug ?? query.category;
    if (categorySlug) {
      const category = await this.prisma.category.findUnique({
        where: { storeId_slug: { storeId, slug: categorySlug } },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Category not found for this store');
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p."store_id" = ${storeId}::uuid`,
      Prisma.sql`p."is_active" = TRUE`,
    ];
    if (categorySlug) conditions.push(Prisma.sql`c."slug" = ${categorySlug}`);
    if (query.brand) conditions.push(Prisma.sql`LOWER(p."brand") = LOWER(${query.brand})`);
    if (query.min_price) conditions.push(Prisma.sql`p."price" >= ${new Prisma.Decimal(query.min_price)}`);
    if (query.max_price) conditions.push(Prisma.sql`p."price" <= ${new Prisma.Decimal(query.max_price)}`);
    if (options.featured) conditions.push(Prisma.sql`p."is_featured" = TRUE`);
    if (query.in_stock !== undefined) {
      const sellable = Prisma.sql`COALESCE(i."available_quantity" - i."reserved_quantity", 0)`;
      conditions.push(query.in_stock ? Prisma.sql`${sellable} > 0` : Prisma.sql`${sellable} <= 0`);
    }
    if (query.search) {
      const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(Prisma.sql`(
        p."name" ILIKE ${search}
        OR p."brand" ILIKE ${search}
        OR p."sku" ILIKE ${search}
        OR p."tags"::text ILIKE ${search}
      )`);
    }

    const where = Prisma.join(conditions, ' AND ');
    const from = Prisma.sql`FROM "products" AS p
      INNER JOIN "categories" AS c ON c."id" = p."category_id" AND c."store_id" = p."store_id"
      LEFT JOIN "inventory" AS i ON i."product_id" = p."id"`;
    const sortColumns = {
      name: Prisma.raw('p."name"'),
      price: Prisma.raw('p."price"'),
      brand: Prisma.raw('p."brand"'),
      created_at: Prisma.raw('p."created_at"'),
    } as const;
    const sortColumn = sortColumns[query.sort_by ?? 'name'];
    const sortDirection = query.sort_order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    return this.prisma.$transaction(async (tx) => {
      const countRows = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" ${from} WHERE ${where}
      `);
      const idRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id"::text AS "id" ${from} WHERE ${where}
        ORDER BY ${sortColumn} ${sortDirection}, p."id" ASC
        LIMIT ${limit} OFFSET ${offset}
      `);
      const ids = idRows.map(({ id }) => id);
      const records = ids.length > 0
        ? await tx.product.findMany({
            where: { storeId, isActive: true, id: { in: ids } },
            include: PRODUCT_INCLUDE,
          })
        : [];
      const byId = new Map(records.map((record) => [record.id, record]));
      const items = ids.flatMap((id) => {
        const record = byId.get(id);
        return record ? [withInventory(record)] : [];
      });
      const total = Number(countRows[0]?.total ?? 0n);
      return {
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    });
  }
}
