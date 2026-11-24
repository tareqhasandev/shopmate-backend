import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiHeader, ApiNotFoundResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiOkResponse } from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { AiAgentChatRequestDto, AiAgentChatResponseDto } from './dto/ai-agent-chat.dto';
import { AiAgentChatService } from './ai-agent-chat.service';

@ApiTags('AI Agent Chat')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Store-Id', required: false, description: 'Store scope; this is not an authentication credential.' })
@Controller('aiagentchat')
export class AiAgentChatController {
  constructor(
    private readonly chat: AiAgentChatService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Send a message to the ShopMate AI commerce assistant',
    description: 'Protected by the existing ShopMate API bearer token and store scope. A server-generated conversation ID carries store-bound cart and draft-order context across turns. The current provider-independent selector is deterministic; each reported tool execution calls an existing commerce service.',
  })
  @ApiOkResponse({
    type: AiAgentChatResponseDto,
    example: {
      conversationId: '23ed6f50-ef79-4f9d-9e52-ae454b003f90',
      reply: 'I found 2 products: Ceramic Mug — 12.50; Travel Mug — 24.00.',
      mode: 'deterministic_fallback',
      toolExecutions: [{ name: 'search_products', status: 'succeeded' }],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request, store header, or tool input.' })
  @ApiUnauthorizedResponse({ description: 'ShopMate API bearer token is missing or invalid.' })
  @ApiNotFoundResponse({ description: 'Conversation or store-local commerce resource was not found.' })
  async send(
    @Headers('x-store-id') storeHeader: string | undefined,
    @Body() input: AiAgentChatRequestDto,
  ): Promise<AiAgentChatResponseDto> {
    return this.chat.handle(this.storeContext.resolve(storeHeader), input);
  }
}
