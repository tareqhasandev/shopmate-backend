import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const PUBLIC_META_PATHS = [
  /^\/api\/health\/?$/,
  /^\/api\/docs(?:\/.*)?$/,
  /^\/api\/docs-json\/?$/,
];
const PUBLIC_CATALOG_PATHS = [
  /^\/api\/products(?:\/.*)?$/,
  /^\/api\/categories(?:\/.*)?$/,
];

@Injectable()
export class ShopMateApiGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS' || process.env.NODE_ENV === 'test') return true;

    const path = (request.originalUrl || request.url).split('?', 1)[0];
    const publicTestApi = this.config.get<boolean>('SHOPMATE_PUBLIC_TEST_API', false) === true;
    if ((method === 'GET' || method === 'HEAD') && PUBLIC_META_PATHS.some((pattern) => pattern.test(path))) {
      return true;
    }
    if (publicTestApi && /^\/api(?:\/|$)/.test(path)) {
      this.assertStoreScope(request);
      return true;
    }
    if ((method === 'GET' || method === 'HEAD') && PUBLIC_CATALOG_PATHS.some((pattern) => pattern.test(path))) {
      return true;
    }

    const expectedToken = this.config.get<string>('SHOPMATE_API_TOKEN');
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(authorization) : null;
    if (!expectedToken || !match || !constantTimeTokenMatch(expectedToken, match[1])) {
      throw new UnauthorizedException('A valid ShopMate API bearer token is required');
    }

    this.assertStoreScope(request);
    return true;
  }

  private assertStoreScope(request: Request): void {
    const defaultStoreId = this.config.get<string>('SHOPMATE_DEFAULT_STORE_ID')!;
    const allowedStoreId = this.config.get<string>('SHOPMATE_API_STORE_ID', defaultStoreId)!;
    const selectedStoreId = request.headers['x-store-id'] ?? defaultStoreId;
    if (typeof selectedStoreId !== 'string' || selectedStoreId.toLowerCase() !== allowedStoreId.toLowerCase()) {
      throw new ForbiddenException('The request is restricted to the configured ShopMate test store');
    }
  }
}

function constantTimeTokenMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
