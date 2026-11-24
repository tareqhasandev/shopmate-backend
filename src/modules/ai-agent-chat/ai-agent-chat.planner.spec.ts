import { DeterministicChatPlanner } from './ai-agent-chat.planner';

describe('DeterministicChatPlanner', () => {
  const planner = new DeterministicChatPlanner();

  it('uses the product search tool for a catalog request', () => {
    expect(planner.plan('Show me ceramic mugs')).toEqual({
      kind: 'tool', name: 'search_products', arguments: { query: 'ceramic mugs', limit: 10 },
    });
  });

  it('resolves a named product before attempting a cart mutation', () => {
    expect(planner.plan('Add 2 ceramic mugs to my cart')).toEqual({
      kind: 'product', query: 'ceramic mugs', target: 'add_to_cart', quantity: 2,
    });
  });

  it('does not make a purchase-related change for an ambiguous question', () => {
    expect(planner.plan('Should I add the travel mug to my cart?').kind).toBe('reply');
  });
});
