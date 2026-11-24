import { Global, Module } from '@nestjs/common';
import { StoreContextService } from './store-context.service';

@Global()
@Module({ providers: [StoreContextService], exports: [StoreContextService] })
export class StoreContextModule {}
