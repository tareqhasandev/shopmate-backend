import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { validateEnvironment } from '../../config/environment.validation.ts';
import { ShopMateApiGuard } from './shopmate-api.guard.ts';

const TOKEN = 'a-random-shopmate-test-token-with-at-least-32-chars';
const STORE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_STORE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INITIAL_NODE_ENV = process.env.NODE_ENV;

function makeGuard(overrides: Record<string, unknown> = {}): ShopMateApiGuard {
  const values: Record<string, unknown> = {
    SHOPMATE_API_TOKEN: TOKEN,
    SHOPMATE_DEFAULT_STORE_ID: STORE_ID,
    ...overrides,
  };
  const config = {
    get: <T>(key: string, fallback?: T): T => (values[key] ?? fallback) as T,
  } as ConfigService;
  return new ShopMateApiGuard(config);
}

function context(method: string, path: string, authorization?: string, storeId?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  if (storeId) headers['x-store-id'] = storeId;
  const request = { method, originalUrl: path, url: path, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ShopMateApiGuard', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    if (INITIAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = INITIAL_NODE_ENV;
  });

  it('keeps catalog, health, documentation reads, and CORS preflight public by default', () => {
    const guard = makeGuard();
    for (const [path, method] of [
      ['/api/health', 'GET'],
      ['/api/products?search=mug', 'GET'],
      ['/api/categories', 'GET'],
      ['/api/docs', 'GET'],
      ['/api/docs-json', 'GET'],
    ]) {
      expect(guard.canActivate(context(method, path))).toBe(true);
    }
    expect(guard.canActivate(context('OPTIONS', '/api/orders'))).toBe(true);
  });

  it('requires bearer auth for writes and private data when public testing mode is off', () => {
    const guard = makeGuard();
    for (const [method, path] of [
      ['POST', '/api/orders/draft'],
      ['PATCH', '/api/orders/00000000-0000-4000-8000-000000000001'],
      ['DELETE', '/api/cart/00000000-0000-4000-8000-000000000001'],
      ['POST', '/api/products'],
      ['GET', '/api/orders'],
      ['GET', '/api/inventory'],
    ]) {
      expect(() => guard.canActivate(context(method, path))).toThrow(/valid ShopMate API bearer token/);
    }
  });

  it('constant-time compares the bearer token and binds protected access to one store', () => {
    const guard = makeGuard();
    expect(guard.canActivate(context('POST', '/api/orders/draft', `Bearer ${TOKEN}`, STORE_ID))).toBe(true);
    expect(() => guard.canActivate(context('POST', '/api/orders/draft', 'Bearer wrong', STORE_ID)))
      .toThrow(/valid ShopMate API bearer token/);
    expect(() => guard.canActivate(context('POST', '/api/orders/draft', `Bearer ${TOKEN}`, OTHER_STORE_ID)))
      .toThrow(/restricted to the configured ShopMate test store/);
  });

  it('makes every REST method public for the configured test store when public mode is on', () => {
    const guard = makeGuard({ SHOPMATE_PUBLIC_TEST_API: true, SHOPMATE_API_STORE_ID: STORE_ID });
    for (const [method, path] of [
      ['GET', '/api/orders'],
      ['GET', '/api/inventory'],
      ['POST', '/api/orders/draft'],
      ['PATCH', '/api/orders/00000000-0000-4000-8000-000000000001'],
      ['DELETE', '/api/cart/00000000-0000-4000-8000-000000000001'],
      ['POST', '/api/products'],
      ['GET', '/api/products?search=mug'],
    ]) {
      expect(guard.canActivate(context(method, path))).toBe(true);
    }
  });

  it('serves Swagger without store headers while public API calls stay store-scoped', () => {
    const guard = makeGuard({ SHOPMATE_PUBLIC_TEST_API: true, SHOPMATE_API_STORE_ID: OTHER_STORE_ID });
    expect(guard.canActivate(context('GET', '/api/docs/swagger-ui-init.js'))).toBe(true);
    expect(guard.canActivate(context('GET', '/api/docs-json'))).toBe(true);
    expect(() => guard.canActivate(context('GET', '/api/products')))
      .toThrow(/restricted to the configured ShopMate test store/);
    expect(guard.canActivate(context('GET', '/api/products', undefined, OTHER_STORE_ID))).toBe(true);
  });

  it('keeps public test mode confined to the configured store, including catalog reads', () => {
    const guard = makeGuard({ SHOPMATE_PUBLIC_TEST_API: true, SHOPMATE_API_STORE_ID: STORE_ID });
    expect(() => guard.canActivate(context('GET', '/api/products', undefined, OTHER_STORE_ID)))
      .toThrow(/restricted to the configured ShopMate test store/);
    expect(() => guard.canActivate(context('POST', '/api/orders/draft', undefined, OTHER_STORE_ID)))
      .toThrow(/restricted to the configured ShopMate test store/);
  });

  it('allows startup without a bearer secret only when public testing mode is enabled', () => {
    const base = { DATABASE_URL: 'postgresql://shopmate:local-only@localhost:5432/shopmate?schema=shopmate' };
    expect(() => validateEnvironment(base))
      .toThrow(/SHOPMATE_API_TOKEN is required unless SHOPMATE_PUBLIC_TEST_API=true/);
    expect(validateEnvironment({ ...base, SHOPMATE_PUBLIC_TEST_API: 'true' }).SHOPMATE_PUBLIC_TEST_API).toBe(true);
    expect(() => validateEnvironment({ ...base, SHOPMATE_PUBLIC_TEST_API: 'sometimes' }))
      .toThrow(/Invalid environment configuration/);
  });
});
