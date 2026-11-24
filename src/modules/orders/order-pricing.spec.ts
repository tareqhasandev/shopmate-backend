import { Prisma } from '@prisma/client';
import { assertSellableInventory, calculateDraftOrderAmounts, InventoryUnavailableError } from './order-pricing';

describe('draft-order pricing', () => {
  it('calculates totals with exact decimal arithmetic and keeps unit price snapshots', () => {
    const result = calculateDraftOrderAmounts([
      { productId: 'p-1', productName: 'Desk Lamp', sku: 'LAMP-1', unitPrice: new Prisma.Decimal('19.95'), quantity: 3 },
      { productId: 'p-2', productName: 'Notebook', sku: 'NOTE-1', unitPrice: new Prisma.Decimal('4.10'), quantity: 2 },
    ]);

    expect(result.items[0].unitPrice.toFixed(2)).toBe('19.95');
    expect(result.items[0].lineTotal.toFixed(2)).toBe('59.85');
    expect(result.subtotal.toFixed(2)).toBe('68.05');
    expect(result.discount.toFixed(2)).toBe('0.00');
    expect(result.shippingCost.toFixed(2)).toBe('0.00');
    expect(result.total.toFixed(2)).toBe('68.05');
  });
});

describe('draft-order inventory checks', () => {
  it('allows only the unreserved available quantity', () => {
    expect(() => assertSellableInventory(8, 3, 5)).not.toThrow();
    expect(() => assertSellableInventory(8, 3, 6)).toThrow(InventoryUnavailableError);
  });

  it('rejects negative or inconsistent inventory and zero quantities', () => {
    expect(() => assertSellableInventory(4, 5, 1)).toThrow(InventoryUnavailableError);
    expect(() => assertSellableInventory(-1, 0, 1)).toThrow(InventoryUnavailableError);
    expect(() => assertSellableInventory(4, 0, 0)).toThrow(InventoryUnavailableError);
  });
});
