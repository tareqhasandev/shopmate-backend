import { AiAgentChatRequestDto } from './dto/ai-agent-chat.dto';
import { AiAgentChatRepository, AiConversation } from './ai-agent-chat.repository';
import { AiAgentPlanner } from './ai-agent-chat.planner';
import { CommerceToolRegistry } from './commerce-tool.registry';
import { AiAgentChatService } from './ai-agent-chat.service';

describe('AiAgentChatService', () => {
  it('stores both turns and reports only a successfully executed tool', async () => {
    const conversation: AiConversation = {
      id: '23ed6f50-ef79-4f9d-9e52-ae454b003f90', storeId: '23ed6f50-ef79-4f9d-9e52-ae454b003f90',
      cartId: null, draftOrderId: null, messages: [],
    };
    const repository = {
      create: jest.fn().mockResolvedValue(conversation),
      findForStore: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const tools = { execute: jest.fn().mockResolvedValue({ items: [{ name: 'Ceramic Mug', price: '12.50' }] }) };
    const planner: AiAgentPlanner = { plan: jest.fn().mockReturnValue({ kind: 'tool', name: 'search_products', arguments: { query: 'mugs' } }) };
    const service = new AiAgentChatService(
      repository as unknown as AiAgentChatRepository,
      tools as unknown as CommerceToolRegistry,
      planner,
    );

    const response = await service.handle(conversation.storeId, { message: 'Show me mugs' } as AiAgentChatRequestDto);

    expect(tools.execute).toHaveBeenCalledWith(conversation.storeId, conversation, 'search_products', { query: 'mugs' });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ messages: expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'Show me mugs' }),
      expect.objectContaining({ role: 'assistant' }),
    ]) }));
    expect(response.toolExecutions).toEqual([{ name: 'search_products', status: 'succeeded' }]);
    expect(response.mode).toBe('deterministic_fallback');
  });

  it('keeps conversation IDs store-scoped', async () => {
    const repository = { create: jest.fn(), findForStore: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const tools = { execute: jest.fn() };
    const planner: AiAgentPlanner = { plan: jest.fn() };
    const service = new AiAgentChatService(
      repository as unknown as AiAgentChatRepository,
      tools as unknown as CommerceToolRegistry,
      planner,
    );
    await expect(service.handle('23ed6f50-ef79-4f9d-9e52-ae454b003f90', {
      message: 'hello', conversationId: '9a5fd4aa-cc18-4931-83f5-816ffca41b80',
    })).rejects.toThrow('Conversation not found');
    expect(tools.execute).not.toHaveBeenCalled();
  });
});
