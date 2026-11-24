import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_STORE_ID = process.env.SHOPMATE_DEFAULT_STORE_ID ?? '00000000-0000-4000-8000-000000000001';

const categories = [
  { name: 'Audio', slug: 'audio', description: 'Headphones, speakers, and everyday listening gear.' },
  { name: 'Home Office', slug: 'home-office', description: 'Comfortable, reliable tools for productive workspaces.' },
  { name: 'Kitchen', slug: 'kitchen', description: 'Practical appliances and accessories for everyday cooking.' },
  { name: 'Travel', slug: 'travel', description: 'Thoughtful essentials for trips, commutes, and weekends away.' },
  { name: 'Fitness', slug: 'fitness', description: 'Simple equipment and wearables for active routines.' },
] as const;

const featuredProductSlugs = new Set([
  'studio-wireless-headphones',
  'precision-burr-coffee-grinder',
  'carry-on-spinner-suitcase',
]);

const products = [
  { name: 'Studio Wireless Headphones', slug: 'studio-wireless-headphones', sku: 'AUD-1001', category: 'audio', price: '129.00', compareAtPrice: '159.00', brand: 'Northstar Audio', stock: 18, specs: { connectivity: 'Bluetooth 5.3', batteryHours: 40, noiseControl: 'Adaptive ANC' }, tags: ['wireless', 'noise-cancelling', 'travel'] },
  { name: 'Pocket Bluetooth Speaker', slug: 'pocket-bluetooth-speaker', sku: 'AUD-1002', category: 'audio', price: '49.95', compareAtPrice: null, brand: 'Northstar Audio', stock: 32, specs: { outputWatts: 12, batteryHours: 14, waterResistance: 'IPX7' }, tags: ['portable', 'water-resistant', 'bluetooth'] },
  { name: 'USB-C Desktop Microphone', slug: 'usb-c-desktop-microphone', sku: 'AUD-1003', category: 'audio', price: '79.50', compareAtPrice: '89.00', brand: 'ClearTone', stock: 11, specs: { polarPattern: 'cardioid', connection: 'USB-C', sampleRateKhz: 48 }, tags: ['streaming', 'podcasting', 'usb-c'] },
  { name: 'Ergonomic Mesh Task Chair', slug: 'ergonomic-mesh-task-chair', sku: 'OFF-2001', category: 'home-office', price: '249.00', compareAtPrice: '299.00', brand: 'Form & Field', stock: 7, specs: { material: 'breathable mesh', adjustments: ['height', 'tilt', 'lumbar'], maxLoadKg: 120 }, tags: ['ergonomic', 'desk', 'adjustable'] },
  { name: 'Compact Mechanical Keyboard', slug: 'compact-mechanical-keyboard', sku: 'OFF-2002', category: 'home-office', price: '89.00', compareAtPrice: null, brand: 'Keyline', stock: 24, specs: { layout: '75%', switches: 'tactile', connection: 'USB-C and Bluetooth' }, tags: ['keyboard', 'mechanical', 'compact'] },
  { name: 'Adjustable Monitor Riser', slug: 'adjustable-monitor-riser', sku: 'OFF-2003', category: 'home-office', price: '39.99', compareAtPrice: null, brand: 'Form & Field', stock: 0, specs: { material: 'bamboo composite', widthCm: 52, storage: 'open shelf' }, tags: ['monitor', 'desk', 'bamboo'] },
  { name: 'Precision Burr Coffee Grinder', slug: 'precision-burr-coffee-grinder', sku: 'KIT-3001', category: 'kitchen', price: '94.00', compareAtPrice: '109.00', brand: 'Morning Works', stock: 13, specs: { grindSettings: 30, capacityGrams: 250, burrType: 'conical stainless steel' }, tags: ['coffee', 'grinder', 'kitchen'] },
  { name: 'Stainless Steel Electric Kettle', slug: 'stainless-electric-kettle', sku: 'KIT-3002', category: 'kitchen', price: '58.00', compareAtPrice: null, brand: 'Hearthside', stock: 16, specs: { capacityLitres: 1.7, powerWatts: 1500, autoShutoff: true }, tags: ['kettle', 'tea', 'stainless-steel'] },
  { name: 'Digital Kitchen Scale', slug: 'digital-kitchen-scale', sku: 'KIT-3003', category: 'kitchen', price: '22.50', compareAtPrice: null, brand: 'Hearthside', stock: 0, specs: { maxWeightGrams: 5000, incrementsGrams: 1, units: ['g', 'oz', 'ml'] }, tags: ['baking', 'scale', 'compact'] },
  { name: 'Carry-On Spinner Suitcase', slug: 'carry-on-spinner-suitcase', sku: 'TRV-4001', category: 'travel', price: '169.00', compareAtPrice: '189.00', brand: 'Wayfarer Co.', stock: 9, specs: { capacityLitres: 38, shell: 'polycarbonate', wheels: 4, cabinCompatible: true }, tags: ['carry-on', 'luggage', 'weekend'] },
  { name: 'Packable Travel Daypack', slug: 'packable-travel-daypack', sku: 'TRV-4002', category: 'travel', price: '44.00', compareAtPrice: null, brand: 'Wayfarer Co.', stock: 27, specs: { capacityLitres: 18, weightGrams: 310, waterResistance: 'water-repellent' }, tags: ['backpack', 'lightweight', 'packable'] },
  { name: 'Universal Travel Adapter', slug: 'universal-travel-adapter', sku: 'TRV-4003', category: 'travel', price: '32.95', compareAtPrice: null, brand: 'VoltPath', stock: 21, specs: { regions: ['US', 'EU', 'UK', 'AU'], usbPorts: 3, maxWatts: 20 }, tags: ['adapter', 'charging', 'international'] },
  { name: 'Everyday Fitness Tracker', slug: 'everyday-fitness-tracker', sku: 'FIT-5001', category: 'fitness', price: '99.00', compareAtPrice: '119.00', brand: 'Motion Loop', stock: 14, specs: { batteryDays: 7, waterResistance: '5 ATM', sensors: ['heart rate', 'sleep', 'steps'] }, tags: ['wearable', 'activity', 'health'] },
  { name: 'Adjustable Kettlebell 5–18 kg', slug: 'adjustable-kettlebell', sku: 'FIT-5002', category: 'fitness', price: '119.00', compareAtPrice: null, brand: 'CoreFoundry', stock: 6, specs: { weightRangeKg: [5, 18], material: 'cast iron and steel', adjustment: 'selector pin' }, tags: ['strength', 'home-gym', 'adjustable'] },
  { name: 'Non-Slip Yoga Mat', slug: 'non-slip-yoga-mat', sku: 'FIT-5003', category: 'fitness', price: '35.00', compareAtPrice: null, brand: 'Grounded Movement', stock: 20, specs: { lengthCm: 183, thicknessMm: 5, material: 'natural rubber blend' }, tags: ['yoga', 'stretching', 'non-slip'] },
] as const;

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const store = await tx.store.upsert({
      where: { id: DEFAULT_STORE_ID },
      update: { name: 'ShopMate Demo Store', slug: 'shopmate-demo', currency: 'USD' },
      create: { id: DEFAULT_STORE_ID, name: 'ShopMate Demo Store', slug: 'shopmate-demo', currency: 'USD' },
    });

    const categoryIds = new Map<string, string>();
    for (const category of categories) {
      const saved = await tx.category.upsert({
        where: { storeId_slug: { storeId: store.id, slug: category.slug } },
        update: { name: category.name, description: category.description },
        create: { storeId: store.id, ...category },
      });
      categoryIds.set(category.slug, saved.id);
    }

    for (const product of products) {
      const categoryId = categoryIds.get(product.category);
      if (!categoryId) throw new Error(`Missing seed category: ${product.category}`);
      const data = {
        storeId: store.id,
        categoryId,
        name: product.name,
        slug: product.slug,
        description: `${product.name} by ${product.brand}, selected for dependable everyday use. Review the listed specifications to compare size, materials, and key features.`,
        sku: product.sku,
        price: new Prisma.Decimal(product.price),
        compareAtPrice: product.compareAtPrice ? new Prisma.Decimal(product.compareAtPrice) : null,
        brand: product.brand,
        imageUrl: `https://placehold.co/800x600?text=${encodeURIComponent(product.slug)}`,
        specifications: product.specs as Prisma.InputJsonValue,
        tags: product.tags as unknown as Prisma.InputJsonValue,
      isActive: true,
      isFeatured: featuredProductSlugs.has(product.slug),
    };
      const savedProduct = await tx.product.upsert({
        where: { storeId_sku: { storeId: store.id, sku: product.sku } },
        update: data,
        create: data,
      });
      await tx.inventory.upsert({
        where: { productId: savedProduct.id },
        update: { availableQuantity: product.stock, reservedQuantity: 0 },
        create: { productId: savedProduct.id, availableQuantity: product.stock, reservedQuantity: 0 },
      });
    }
  });

  console.log(`Seeded ${categories.length} categories and ${products.length} products for the demo store.`);
}

main()
  .catch((error: unknown) => {
    console.error('ShopMate seed failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
