import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CartModule } from './modules/cart/cart.module';
import { AiAgentChatModule } from './modules/ai-agent-chat/ai-agent-chat.module';
import { validateEnvironment } from './config/environment.validation';
import { PrismaModule } from './database/prisma.module';
import { StoreContextModule } from './common/store/store-context.module';
import { HealthModule } from './modules/health/health.module';
import { ShopMateApiGuard } from './common/auth/shopmate-api.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    StoreContextModule,
    HealthModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    OrdersModule,
    CartModule,
    AiAgentChatModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ShopMateApiGuard }],
})
export class AppModule {}
