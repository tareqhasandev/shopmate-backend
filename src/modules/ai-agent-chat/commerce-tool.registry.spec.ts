import { BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { CartService } from '../cart/cart.service';
import { OrdersService } from '../orders/orders.service';
import { COMMERCE_TOOL_NAMES, CommerceToolRegistry } from './commerce-tool.registry';

describe('CommerceToolRegistry', () => {
  const registry = new CommerceToolRegistry(
    {} as ProductsService, {} as InventoryService, {} as CartService, {} as OrdersService,
  );

  it('registers all 12 commerce tools', () => {
    expect(registry.names).toHaveLength(12);
    expect(registry.names).toEqual(COMMERCE_TOOL_NAMES);
    expect(registry.definitions.map((tool) => tool.name)).toEqual(COMMERCE_TOOL_NAMES);
  });

  it('rejects invalid quantities and caller-supplied resource IDs', () => {
    expect(() => registry.validateCall('add_to_cart', { productId: '123e4567-e89b-42d3-a456-426614174000', quantity: 101 })).toThrow(BadRequestException);
    expect(() => registry.validateCall('get_cart', { cartId: '123e4567-e89b-42d3-a456-426614174000' })).toThrow(BadRequestException);
  });

  it('does not accept client-supplied prices', () => {
    expect(() => registry.validateCall('add_to_cart', {
      productId: '123e4567-e89b-42d3-a456-426614174000', quantity: 1, price: '0.01',
    })).toThrow(BadRequestException);
  });
});
