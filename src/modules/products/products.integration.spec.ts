import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { ApiResponseInterceptor } from '../../common/interceptors/api-response.interceptor';
import { PrismaService } from '../../database/prisma.service';

const hasIsolatedShopmateDatabase = (() => {
  if (!process.env.DATABASE_URL) return false;
  try {
    return new URL(process.env.DATABASE_URL).searchParams.get('schema') === 'shopmate';
  } catch {
    return false;
  }
})();

const integrationDescribe = hasIsolatedShopmateDatabase ? describe : describe.skip;

type ApiResult = { status: number; body: any };

integrationDescribe('Product Catalog REST API (PostgreSQL integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let storeId: string;
  let categoryId: string;
  let activeProductId: string;
  let outOfStockProductId: string;
  let fixtureSlug: string;
  let fixtureSku: string;
  let suffix: string;
  let swaggerDocument: Record<string, any>;

  async function request(path: string, init: RequestInit = {}): Promise<ApiResult> {
    const response = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Id': storeId,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    suffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const { AppModule } = require('../../app.module') as typeof import('../../app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ShopMate AI Commerce API')
      .setDescription('Catalog, inventory, customer registration, cart and draft-order API. Draft orders never initiate payment.')
      .setVersion('0.1.0')
      .build();
    swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server did not bind to a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);

    const store = await prisma.store.create({
      data: { name: `Catalog API test ${suffix}`, slug: `catalog-api-test-${suffix}` },
      select: { id: true },
    });
    storeId = store.id;
    const category = await prisma.category.create({
      data: { storeId, name: 'Test Essentials', slug: 'test-essentials', description: 'Disposable integration-test category.' },
      select: { id: true },
    });
    categoryId = category.id;

    const active = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: 'Commuter Vessel',
        slug: `commuter-vessel-${suffix}`,
        description: 'Integration fixture for product catalog tests.',
        sku: `TST-MUG-${suffix}`,
        price: new Prisma.Decimal('24.50'),
        brand: 'Test Brand A',
        imageUrl: 'https://example.test/products/commuter-vessel.jpg',
        specifications: { material: 'ceramic' },
        tags: ['ceramic', 'travel-mug'],
        isActive: true,
        isFeatured: true,
        inventory: { create: { availableQuantity: 5, reservedQuantity: 0 } },
      },
      select: { id: true },
    });
    activeProductId = active.id;
    fixtureSlug = `commuter-vessel-${suffix}`;
    fixtureSku = `TST-MUG-${suffix}`;

    const outOfStock = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: 'Steel Water Bottle',
        slug: `steel-water-bottle-${suffix}`,
        description: 'Out-of-stock integration fixture.',
        sku: `TST-BTL-${suffix}`,
        price: new Prisma.Decimal('11.00'),
        brand: 'Test Brand A',
        imageUrl: 'https://example.test/products/steel-bottle.jpg',
        specifications: {},
        tags: ['steel', 'bottle'],
        isActive: true,
        isFeatured: false,
        inventory: { create: { availableQuantity: 0, reservedQuantity: 0 } },
      },
      select: { id: true },
    });
    outOfStockProductId = outOfStock.id;

    await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: 'Trail Storage Case',
        slug: `trail-storage-case-${suffix}`,
        description: 'Second in-stock integration fixture.',
        sku: `TST-CASE-${suffix}`,
        price: new Prisma.Decimal('39.00'),
        brand: 'Summit Gear',
        imageUrl: 'https://example.test/products/trail-case.jpg',
        specifications: {},
        tags: ['outdoors', 'storage'],
        isActive: true,
        isFeatured: false,
        inventory: { create: { availableQuantity: 9, reservedQuantity: 0 } },
      },
    });
  }, 30000);

  afterAll(async () => {
    try {
      if (prisma && storeId) {
        await prisma.draftOrder.deleteMany({ where: { storeId } });
        await prisma.shoppingCart.deleteMany({ where: { storeId } });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.category.deleteMany({ where: { storeId } });
        await prisma.store.delete({ where: { id: storeId } });
      }
    } finally {
      if (app) await app.close();
    }
  }, 30000);

  it('covers Swagger documentation and the product catalog routes, CRUD, validation, and inactive visibility', async () => {
    const docs = swaggerDocument;
    const documentedPaths = Object.keys(docs.paths as Record<string, unknown>);
    const pathFor = (suffix: string) => documentedPaths.find((path) => path.endsWith(suffix));
    const listPath = pathFor('/products');
    const searchPath = pathFor('/products/search');
    const featuredPath = pathFor('/products/featured');
    const categoriesPath = pathFor('/products/categories');
    const categoryPath = pathFor('/products/category/{slug}');
    const detailPath = pathFor('/products/{id}');
    const inventoryListPath = pathFor('/inventory');
    const inventoryDetailPath = pathFor('/inventory/{productId}');
    const availabilityPath = pathFor('/inventory/{productId}/availability');
    const adjustmentPath = pathFor('/inventory/{productId}/adjustments');
    const cartPath = pathFor('/cart');
    const cartDetailPath = pathFor('/cart/{id}');
    const cartItemsPath = pathFor('/cart/{id}/items');
    const cartItemPath = pathFor('/cart/{id}/items/{itemId}');
    const createDraftPath = pathFor('/orders/draft');
    const legacyDraftPath = pathFor('/orders/drafts');
    const ordersPath = pathFor('/orders');
    const orderPath = pathFor('/orders/{id}');
    const orderItemPath = pathFor('/orders/{id}/items/{itemId}');
    const confirmDraftPath = pathFor('/orders/{id}/confirm-draft');
    expect([listPath, searchPath, featuredPath, categoriesPath, categoryPath, detailPath, inventoryListPath, inventoryDetailPath, availabilityPath, adjustmentPath, cartPath, cartDetailPath, cartItemsPath, cartItemPath, createDraftPath, legacyDraftPath, ordersPath, orderPath, orderItemPath, confirmDraftPath]).not.toContain(undefined);
    expect(docs.paths[cartPath!].post).toBeDefined();
    expect(docs.paths[cartDetailPath!].get).toBeDefined();
    expect(docs.paths[cartItemsPath!].post).toBeDefined();
    expect(docs.paths[cartItemPath!].patch).toBeDefined();
    expect(docs.paths[cartItemPath!].delete).toBeDefined();
    expect(docs.paths[cartDetailPath!].delete).toBeDefined();
    expect(docs.paths[createDraftPath!].post).toBeDefined();
    expect(docs.paths[legacyDraftPath!].post.deprecated).toBe(true);
    expect(docs.paths[ordersPath!].get).toBeDefined();
    expect(docs.paths[orderPath!].get).toBeDefined();
    expect(docs.paths[orderPath!].patch).toBeDefined();
    expect(docs.paths[orderItemPath!].patch).toBeDefined();
    expect(docs.paths[orderItemPath!].delete).toBeDefined();
    expect(docs.paths[confirmDraftPath!].post).toBeDefined();
    const documentedOrderOperations = [
      docs.paths[createDraftPath!].post,
      docs.paths[ordersPath!].get,
      docs.paths[orderPath!].get,
      docs.paths[orderPath!].patch,
      docs.paths[orderItemPath!].patch,
      docs.paths[orderItemPath!].delete,
      docs.paths[confirmDraftPath!].post,
    ];
    for (const operation of documentedOrderOperations) {
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['500']).toBeDefined();
    }
    expect(docs.paths[createDraftPath!].post.responses['409']).toBeDefined();
    expect(docs.paths[orderPath!].patch.responses['404']).toBeDefined();
    expect(docs.paths[createDraftPath!].post.responses['400'].content['application/json'].schema.$ref).toContain('ApiErrorResponseDto');
    expect(docs.paths[listPath!].get.responses['200'].content['application/json'].schema.example.data.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(docs.paths[searchPath!].get.parameters.some((parameter: { name: string }) => parameter.name === 'search')).toBe(true);
    expect(docs.paths[listPath!].post.requestBody.content['application/json'].examples.createProduct.value.sku).toBe('MUG-6101');
    expect(docs.paths[detailPath!].delete.responses['200'].description).toMatch(/deactivated/i);
    expect(docs.paths[inventoryListPath!].get.responses['200'].content['application/json'].schema.example.data.items[0].sellableQuantity).toBe(16);
    expect(docs.paths[inventoryDetailPath!].patch.requestBody.content['application/json'].examples.setStock.value.availableQuantity).toBe(32);
    expect(docs.paths[availabilityPath!].get.responses['200'].content['application/json'].schema.example.data.status).toBe('out_of_stock');
    expect(docs.paths[adjustmentPath!].post.requestBody.content['application/json'].examples.receiveStock.value.quantityChange).toBe(8);

    const firstPage = await request('/products?sort_by=price&sort_order=asc&page=1&limit=1');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.pagination).toMatchObject({ page: 1, limit: 1, total: 3, totalPages: 3 });
    expect(firstPage.body.data.items).toHaveLength(1);
    expect(firstPage.body.data.items[0].price).toBe('11');
    expect(firstPage.body.data.items[0].inventory).toMatchObject({ availableQuantity: 0, reservedQuantity: 0, sellableQuantity: 0 });

    const filtered = await request('/products?min_price=20&max_price=30&brand=Test%20Brand%20A&category=test-essentials&in_stock=true');
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.pagination.total).toBe(1);
    expect(filtered.body.data.items[0].sku).toBe(fixtureSku);

    const inStock = await request('/products?in_stock=true');
    expect(inStock.body.data.pagination.total).toBe(2);
    const outOfStock = await request('/products?in_stock=false');
    expect(outOfStock.body.data.pagination.total).toBe(1);
    expect(outOfStock.body.data.items[0].id).toBe(outOfStockProductId);

    for (const term of ['Commuter Vessel', 'Test Brand A', fixtureSku, 'ceramic']) {
      const result = await request(`/products/search?search=${encodeURIComponent(term)}`);
      expect(result.status).toBe(200);
      expect(result.body.data.items.some((item: { id: string }) => item.id === activeProductId)).toBe(true);
    }
    const listSearch = await request('/products?search=travel-mug');
    expect(listSearch.body.data.pagination.total).toBe(1);

    const featured = await request('/products/featured');
    expect(featured.status).toBe(200);
    expect(featured.body.data.pagination.total).toBe(1);
    expect(featured.body.data.items[0]).toMatchObject({ id: activeProductId, isFeatured: true });

    const categories = await request('/products/categories');
    expect(categories.status).toBe(200);
    expect(categories.body.data.items).toContainEqual(expect.objectContaining({ slug: 'test-essentials', productCount: 3 }));

    const categoryProducts = await request('/products/category/test-essentials?sort_by=price&sort_order=desc');
    expect(categoryProducts.status).toBe(200);
    expect(categoryProducts.body.data.pagination.total).toBe(3);
    expect(categoryProducts.body.data.items[0].sku).toBe(`TST-CASE-${suffix}`);

    const detail = await request(`/products/${activeProductId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: activeProductId, sku: fixtureSku, inventory: { availableQuantity: 5, sellableQuantity: 5 } });
    const legacySlugDetail = await request(`/products/${fixtureSlug}`);
    expect(legacySlugDetail.status).toBe(200);
    expect(legacySlugDetail.body.data.id).toBe(activeProductId);

    const created = await request('/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Created Demo Flask ${suffix}`,
        categoryId,
        description: 'Created through the integration-tested REST endpoint.',
        sku: `TST-NEW-${suffix}`,
        price: '18.75',
        brand: 'Test Brand C',
        imageUrl: 'https://example.test/products/created-flask.jpg',
        tags: ['flask', 'integration'],
        initialStock: 3,
      }),
    });
    expect(created.status).toBe(201);
    const createdProduct = created.body.data;
    expect(createdProduct.slug).toBe(`created-demo-flask-${suffix}`);
    expect(createdProduct.inventory).toMatchObject({ availableQuantity: 3, reservedQuantity: 0, sellableQuantity: 3 });

    const updated = await request(`/products/${createdProduct.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ price: '19.99', availableQuantity: 6, isFeatured: true }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ price: '19.99', isFeatured: true, inventory: { availableQuantity: 6, sellableQuantity: 6 } });

    const deactivated = await request(`/products/${createdProduct.id}`, { method: 'DELETE' });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data).toMatchObject({ isActive: false, isFeatured: false });
    const inactiveInList = await request(`/products?search=${encodeURIComponent(`Created Demo Flask ${suffix}`)}`);
    expect(inactiveInList.body.data.pagination.total).toBe(0);
    const inactiveDetail = await request(`/products/${createdProduct.id}`);
    expect(inactiveDetail.status).toBe(404);

    const invalidBoolean = await request('/products?in_stock=sometimes');
    expect(invalidBoolean.status).toBe(400);
    const invalidPrice = await request('/products?min_price=-1');
    expect(invalidPrice.status).toBe(400);
    const missingSearch = await request('/products/search');
    expect(missingSearch.status).toBe(400);
  }, 30000);

  it('lists inventory, exposes availability, rejects unsafe stock changes, and serializes concurrent adjustments', async () => {
    const inventoryList = await request('/inventory?page=1&limit=100');
    expect(inventoryList.status).toBe(200);
    expect(inventoryList.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: activeProductId, availableQuantity: 5, reservedQuantity: 0, sellableQuantity: 5 }),
    ]));

    const inventoryDetail = await request(`/inventory/${activeProductId}`);
    expect(inventoryDetail.status).toBe(200);
    expect(inventoryDetail.body.data).toMatchObject({ productId: activeProductId, availableQuantity: 5, sellableQuantity: 5 });

    const availability = await request(`/inventory/${outOfStockProductId}/availability`);
    expect(availability.status).toBe(200);
    expect(availability.body.data).toMatchObject({ isAvailable: false, status: 'out_of_stock', sellableQuantity: 0 });

    const setStock = await request(`/inventory/${activeProductId}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 10 }),
    });
    expect(setStock.status).toBe(200);
    expect(setStock.body.data).toMatchObject({ availableQuantity: 10, reservedQuantity: 0, sellableQuantity: 10 });

    const invalidSet = await request(`/inventory/${activeProductId}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: -1 }),
    });
    expect(invalidSet.status).toBe(400);

    const received = await request(`/inventory/${activeProductId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ quantityChange: 3, reason: 'Integration test delivery' }),
    });
    expect(received.status).toBe(201);
    expect(received.body.data).toMatchObject({ availableQuantity: 13, reservedQuantity: 0, sellableQuantity: 13 });
    expect(received.body.data.adjustment).toMatchObject({ quantityChange: 3, availableBefore: 10, availableAfter: 13, reason: 'Integration test delivery' });

    const belowReserved = await request(`/inventory/${activeProductId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ quantityChange: -14, reason: 'Negative stock is not allowed' }),
    });
    expect(belowReserved.status).toBe(409);

    const concurrentReceipts = await Promise.all([
      request(`/inventory/${activeProductId}/adjustments`, { method: 'POST', body: JSON.stringify({ quantityChange: 2, reason: 'Concurrent receipt A' }) }),
      request(`/inventory/${activeProductId}/adjustments`, { method: 'POST', body: JSON.stringify({ quantityChange: 3, reason: 'Concurrent receipt B' }) }),
    ]);
    expect(concurrentReceipts.map((result) => result.status)).toEqual([201, 201]);
    const afterReceipts = await request(`/inventory/${activeProductId}`);
    expect(afterReceipts.body.data).toMatchObject({ availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 });

    const resetStock = await request(`/inventory/${activeProductId}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 10 }),
    });
    expect(resetStock.status).toBe(200);
    const concurrentRemovals = await Promise.all([
      request(`/inventory/${activeProductId}/adjustments`, { method: 'POST', body: JSON.stringify({ quantityChange: -8, reason: 'Concurrent removal A' }) }),
      request(`/inventory/${activeProductId}/adjustments`, { method: 'POST', body: JSON.stringify({ quantityChange: -8, reason: 'Concurrent removal B' }) }),
    ]);
    expect(concurrentRemovals.map((result) => result.status).sort()).toEqual([201, 409]);
    const finalStock = await request(`/inventory/${activeProductId}`);
    expect(finalStock.body.data).toMatchObject({ availableQuantity: 2, reservedQuantity: 0, sellableQuantity: 2 });

    const oversizedDraft = await request('/orders/drafts', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: activeProductId, quantity: 3 }] }),
    });
    expect(oversizedDraft.status).toBe(409);
    expect(oversizedDraft.body.error.message).toMatch(/out of stock/i);

    const competingDrafts = await Promise.all([
      request('/orders/drafts', { method: 'POST', body: JSON.stringify({ items: [{ productId: activeProductId, quantity: 2 }] }) }),
      request('/orders/drafts', { method: 'POST', body: JSON.stringify({ items: [{ productId: activeProductId, quantity: 2 }] }) }),
    ]);
    expect(competingDrafts.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(competingDrafts.find((result) => result.status === 409)?.body.error.message).toMatch(/out of stock/i);
    const acceptedDraft = competingDrafts.find((result) => result.status === 201)!.body.data;

    const reservedStock = await request(`/inventory/${activeProductId}`);
    expect(reservedStock.body.data).toMatchObject({ availableQuantity: 2, reservedQuantity: 2, sellableQuantity: 0 });
    const reservedAvailability = await request(`/inventory/${activeProductId}/availability`);
    expect(reservedAvailability.body.data).toMatchObject({ isAvailable: false, status: 'out_of_stock' });
    const unsafeReduction = await request(`/inventory/${activeProductId}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 1 }),
    });
    expect(unsafeReduction.status).toBe(409);

    const cancelled = await request(`/orders/${acceptedDraft.id}/cancel`, { method: 'POST' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    const releasedStock = await request(`/inventory/${activeProductId}`);
    expect(releasedStock.body.data).toMatchObject({ availableQuantity: 2, reservedQuantity: 0, sellableQuantity: 2 });

    const invalidAdjustment = await request(`/inventory/${activeProductId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ quantityChange: 0, reason: 'Zero delta is not valid' }),
    });
    expect(invalidAdjustment.status).toBe(400);
  }, 30000);

  it('creates and updates persistent carts with current prices, stock validation, and recalculated subtotals', async () => {
    const product = await prisma.product.create({
      data: {
        storeId,
        categoryId,
        name: 'Cart Price Fixture',
        slug: `cart-price-fixture-${suffix}`,
        description: 'Disposable cart integration fixture.',
        sku: `TST-CART-${suffix}`,
        price: new Prisma.Decimal('7.25'),
        brand: 'Test Brand Cart',
        imageUrl: 'https://example.test/products/cart-fixture.jpg',
        specifications: {},
        tags: ['cart'],
        isActive: true,
        inventory: { create: { availableQuantity: 5, reservedQuantity: 0 } },
      },
      select: { id: true },
    });

    const clientPrice = await request('/cart', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 1, unitPrice: '0.01' }] }),
    });
    expect(clientPrice.status).toBe(400);

    const created = await request('/cart', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
    });
    expect(created.status).toBe(201);
    const cartId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      currency: 'USD',
      itemCount: 1,
      subtotal: '7.25',
      items: [expect.objectContaining({ quantity: 1, unitPrice: '7.25', lineTotal: '7.25', isAvailable: true })],
    });
    const itemId = created.body.data.items[0].id;

    const fetched = await request(`/cart/${cartId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.subtotal).toBe('7.25');

    const added = await request(`/cart/${cartId}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, quantity: 2 }),
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ itemCount: 3, subtotal: '21.75' });
    expect(added.body.data.items).toHaveLength(1);
    expect(added.body.data.items[0]).toMatchObject({ id: itemId, quantity: 3, lineTotal: '21.75' });

    const updated = await request(`/cart/${cartId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 5 }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ itemCount: 5, subtotal: '36.25' });

    const overStock = await request(`/cart/${cartId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 6 }),
    });
    expect(overStock.status).toBe(409);
    expect(overStock.body.error.message).toMatch(/out of stock/i);
    const afterRejectedUpdate = await request(`/cart/${cartId}`);
    expect(afterRejectedUpdate.body.data).toMatchObject({ itemCount: 5, subtotal: '36.25' });

    const outOfStock = await request(`/cart/${cartId}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId: outOfStockProductId, quantity: 1 }),
    });
    expect(outOfStock.status).toBe(409);
    expect(outOfStock.body.error.message).toMatch(/out of stock/i);

    const removedItem = await request(`/cart/${cartId}/items/${itemId}`, { method: 'DELETE' });
    expect(removedItem.status).toBe(200);
    expect(removedItem.body.data).toMatchObject({ items: [], itemCount: 0, subtotal: '0.00' });
    const deleted = await request(`/cart/${cartId}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toMatchObject({ cartId, deleted: true });
    expect((await request(`/cart/${cartId}`)).status).toBe(404);

    const concurrentCart = await request('/cart', { method: 'POST', body: JSON.stringify({}) });
    expect(concurrentCart.status).toBe(201);
    const competingAdds = await Promise.all([
      request(`/cart/${concurrentCart.body.data.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity: 3 }),
      }),
      request(`/cart/${concurrentCart.body.data.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity: 3 }),
      }),
    ]);
    expect(competingAdds.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(competingAdds.find((result) => result.status === 409)?.body.error.message).toMatch(/out of stock/i);
    const concurrentItemId = competingAdds.find((result) => result.status === 201)!.body.data.items[0].id;
    const clearedConcurrentCart = await request(`/cart/${concurrentCart.body.data.id}/items/${concurrentItemId}`, { method: 'DELETE' });
    expect(clearedConcurrentCart.body.data).toMatchObject({ itemCount: 0, subtotal: '0.00' });
    expect((await request(`/cart/${concurrentCart.body.data.id}`, { method: 'DELETE' })).status).toBe(200);
  }, 30000);

  it('creates, updates, confirms, lists, and cancels unpaid drafts with transactional stock and price snapshots', async () => {
    const createOrderProduct = async (name: string, slug: string, sku: string, price: string, stock: number) => prisma.product.create({
      data: {
        storeId,
        categoryId,
        name,
        slug: `${slug}-${suffix}`,
        description: 'Disposable draft-order integration fixture.',
        sku: `${sku}-${suffix}`,
        price: new Prisma.Decimal(price),
        brand: 'Test Brand Orders',
        imageUrl: `https://example.test/products/${slug}.jpg`,
        specifications: {},
        tags: ['draft-order'],
        isActive: true,
        inventory: { create: { availableQuantity: stock, reservedQuantity: 0 } },
      },
      select: { id: true },
    });
    const first = await createOrderProduct('Draft Snapshot Product', 'draft-snapshot-product', 'TST-ORD-A', '10.00', 5);
    const second = await createOrderProduct('Draft Second Product', 'draft-second-product', 'TST-ORD-B', '2.50', 4);
    const direct = await createOrderProduct('Direct Draft Product', 'direct-draft-product', 'TST-ORD-C', '4.75', 3);

    const cart = await request('/cart', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: first.id, quantity: 2 }, { productId: second.id, quantity: 1 }] }),
    });
    expect(cart.status).toBe(201);
    const cartId = cart.body.data.id;

    const bothSources = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ cartId, items: [{ productId: first.id, quantity: 1 }] }),
    });
    expect(bothSources.status).toBe(400);
    const clientPrice = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: first.id, quantity: 1, unitPrice: '0.01' }] }),
    });
    expect(clientPrice.status).toBe(400);
    const malformedProduct = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: 'not-a-uuid', quantity: 1 }] }),
    });
    expect(malformedProduct.status).toBe(400);
    const missingProduct = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: randomUUID(), quantity: 1 }] }),
    });
    expect(missingProduct.status).toBe(404);
    const outOfStock = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: outOfStockProductId, quantity: 1 }] }),
    });
    expect(outOfStock.status).toBe(409);
    expect(outOfStock.body.error.message).toMatch(/out of stock/i);

    const lowerStock = await request(`/inventory/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 3 }),
    });
    expect(lowerStock.status).toBe(200);
    const draft = await request('/orders/draft', { method: 'POST', body: JSON.stringify({ cartId, notes: 'Gift note pending' }) });
    expect(draft.status).toBe(201);
    const orderId = draft.body.data.id;
    expect(draft.body.data).toMatchObject({ status: 'DRAFT', paymentStatus: 'NOT_PROCESSED', subtotal: '22.50', total: '22.50' });
    expect(draft.body.data.items).toHaveLength(2);
    const firstItem = draft.body.data.items.find((item: { productId: string }) => item.productId === first.id);
    const secondItem = draft.body.data.items.find((item: { productId: string }) => item.productId === second.id);
    expect(firstItem).toMatchObject({ unitPrice: '10.00', quantity: 2, lineTotal: '20.00' });
    expect(secondItem).toMatchObject({ unitPrice: '2.50', quantity: 1, lineTotal: '2.50' });
    expect((await request(`/inventory/${first.id}`)).body.data).toMatchObject({ availableQuantity: 3, reservedQuantity: 2, sellableQuantity: 1 });
    expect((await request(`/cart/${cartId}`)).body.data.items).toHaveLength(2);

    const belowReservation = await request(`/inventory/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 1 }),
    });
    expect(belowReservation.status).toBe(409);
    const overCapacity = await request(`/orders/${orderId}/items/${firstItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 4 }),
    });
    expect(overCapacity.status).toBe(409);
    const increasedStock = await request(`/inventory/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ availableQuantity: 4 }),
    });
    expect(increasedStock.status).toBe(200);

    await prisma.product.update({ where: { id: first.id }, data: { price: new Prisma.Decimal('15.00') } });
    const refreshed = await request(`/orders/${orderId}`);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.items.find((item: { productId: string }) => item.productId === first.id)).toMatchObject({ unitPrice: '10.00', lineTotal: '20.00' });

    const tamperOrderTotal = await request(`/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ total: '0.01' }) });
    expect(tamperOrderTotal.status).toBe(400);
    const updatedOrder = await request(`/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Gift note confirmed' }) });
    expect(updatedOrder.status).toBe(200);
    expect(updatedOrder.body.data.notes).toBe('Gift note confirmed');
    const updatedLine = await request(`/orders/${orderId}/items/${firstItem.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 4 }),
    });
    expect(updatedLine.status).toBe(200);
    expect(updatedLine.body.data).toMatchObject({ subtotal: '42.50', total: '42.50' });
    expect(updatedLine.body.data.items.find((item: { productId: string }) => item.productId === first.id)).toMatchObject({ unitPrice: '10.00', quantity: 4, lineTotal: '40.00' });
    expect((await request(`/inventory/${first.id}`)).body.data).toMatchObject({ availableQuantity: 4, reservedQuantity: 4, sellableQuantity: 0 });

    const missingLine = await request(`/orders/${orderId}/items/${randomUUID()}`, { method: 'DELETE' });
    expect(missingLine.status).toBe(404);
    const removedLine = await request(`/orders/${orderId}/items/${secondItem.id}`, { method: 'DELETE' });
    expect(removedLine.status).toBe(200);
    expect(removedLine.body.data).toMatchObject({ subtotal: '40.00', total: '40.00', items: [expect.objectContaining({ productId: first.id })] });
    expect((await request(`/inventory/${second.id}`)).body.data).toMatchObject({ reservedQuantity: 0, sellableQuantity: 4 });

    const confirmed = await request(`/orders/${orderId}/confirm-draft`, { method: 'POST' });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'NOT_PROCESSED', subtotal: '40.00' });
    expect((await request(`/inventory/${first.id}`)).body.data).toMatchObject({ reservedQuantity: 4, sellableQuantity: 0 });
    expect((await request(`/orders/${orderId}/confirm-draft`, { method: 'POST' })).status).toBe(409);
    expect((await request(`/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Too late' }) })).status).toBe(409);
    const confirmedList = await request('/orders?status=CONFIRMED&page=1&limit=10');
    expect(confirmedList.status).toBe(200);
    expect(confirmedList.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: orderId, paymentStatus: 'NOT_PROCESSED' })]));
    expect((await request('/orders?status=PAID')).status).toBe(400);
    expect((await request('/orders/not-a-uuid')).status).toBe(400);

    const directDraft = await request('/orders/draft', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: direct.id, quantity: 1 }, { productId: direct.id, quantity: 1 }] }),
    });
    expect(directDraft.status).toBe(201);
    expect(directDraft.body.data).toMatchObject({ status: 'DRAFT', subtotal: '9.50', total: '9.50' });
    expect(directDraft.body.data.items).toHaveLength(1);
    expect(directDraft.body.data.items[0]).toMatchObject({ productId: direct.id, unitPrice: '4.75', quantity: 2, lineTotal: '9.50' });
    const directLine = directDraft.body.data.items[0];
    const clearedDraft = await request(`/orders/${directDraft.body.data.id}/items/${directLine.id}`, { method: 'DELETE' });
    expect(clearedDraft.status).toBe(200);
    expect(clearedDraft.body.data).toMatchObject({ subtotal: '0.00', total: '0.00', items: [] });
    expect((await request(`/orders/${directDraft.body.data.id}/confirm-draft`, { method: 'POST' })).status).toBe(409);
    const cancelled = await request(`/orders/${directDraft.body.data.id}/cancel`, { method: 'POST' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', paymentStatus: 'NOT_PROCESSED' });
    expect((await request(`/inventory/${direct.id}`)).body.data).toMatchObject({ reservedQuantity: 0, sellableQuantity: 3 });
    const cancelledList = await request(`/orders?status=CANCELLED`);
    expect(cancelledList.body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: directDraft.body.data.id, status: 'CANCELLED' })]));
  }, 30000);
});
