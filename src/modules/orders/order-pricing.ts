import { Prisma } from '@prisma/client';

export type DraftPriceInput = {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
};

export class InventoryUnavailableError extends Error {
  constructor(message = 'Out of stock: requested quantity exceeds current sellable inventory') {
    super(message);
    this.name = 'InventoryUnavailableError';
  }
}

export function assertSellableInventory(
  availableQuantity: number,
  reservedQuantity: number,
  requestedQuantity: number,
): void {
  if (
    !Number.isInteger(availableQuantity) ||
    !Number.isInteger(reservedQuantity) ||
    !Number.isInteger(requestedQuantity) ||
    availableQuantity < 0 || reservedQuantity < 0 || reservedQuantity > availableQuantity || requestedQuantity < 1
  ) {
    throw new InventoryUnavailableError('Inventory quantities are invalid');
  }
  if (requestedQuantity > availableQuantity - reservedQuantity) {
    throw new InventoryUnavailableError();
  }
}

export function calculateDraftOrderAmounts(
  lines: DraftPriceInput[],
  discountInput: Prisma.Decimal | string | number = '0.00',
  shippingCostInput: Prisma.Decimal | string | number = '0.00',
) {
  const items = lines.map((line) => {
    const unitPrice = new Prisma.Decimal(line.unitPrice).toDecimalPlaces(2);
    const lineTotal = unitPrice.mul(line.quantity).toDecimalPlaces(2);
    return { ...line, unitPrice, lineTotal };
  });
  const subtotal = items.reduce(
    (sum, item) => sum.add(item.lineTotal),
    new Prisma.Decimal('0.00'),
  ).toDecimalPlaces(2);
  const discount = new Prisma.Decimal(discountInput).toDecimalPlaces(2);
  const shippingCost = new Prisma.Decimal(shippingCostInput).toDecimalPlaces(2);
  const total = subtotal.sub(discount).add(shippingCost).toDecimalPlaces(2);
  return { items, subtotal, discount, shippingCost, total };
}
