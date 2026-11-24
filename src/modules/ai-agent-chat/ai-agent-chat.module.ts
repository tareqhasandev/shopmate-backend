import { Module } from '@nestjs/common';
import { StoreContextModule } from '../../common/store/store-context.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartModule } from '../cart/cart.module';
import { OrdersModule } from '../orders/orders.module';
import { AiAgentChatController } from './ai-agent-chat.controller';
import { AiAgentChatRepository } from './ai-agent-chat.repository';
import { AiAgentChatService } from './ai-agent-chat.service';
import { AI_AGENT_PLANNER, DeterministicChatPlanner } from './ai-agent-chat.planner';
import { CommerceToolRegistry } from './commerce-tool.registry';

@Module({
  imports: [StoreContextModule, ProductsModule, InventoryModule, CartModule, OrdersModule],
  controllers: [AiAgentChatController],
  providers: [
    AiAgentChatRepository,
    CommerceToolRegistry,
    AiAgentChatService,
    { provide: AI_AGENT_PLANNER, useClass: DeterministicChatPlanner },
  ],
  exports: [CommerceToolRegistry],
})
export class AiAgentChatModule {}
