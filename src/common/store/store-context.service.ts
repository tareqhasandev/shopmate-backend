import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';

const DEFAULT_STORE_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class StoreContextService {
  constructor(private readonly config: ConfigService) {}

  resolve(requestedStoreId?: string): string {
    const storeId = requestedStoreId?.trim() || this.config.get<string>('SHOPMATE_DEFAULT_STORE_ID') || DEFAULT_STORE_ID;
    if (!isUUID(storeId)) {
      throw new BadRequestException('X-Store-Id must be a UUID');
    }
    return storeId;
  }
}
