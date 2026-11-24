import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { CreateInventoryAdjustmentDto, InventoryListQueryDto, UpdateInventoryDto } from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List store inventory',
    description: 'Lists product stock, reservations, and sellable quantities for the selected store. Products without an inventory row are shown with zero stock.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false, description: 'Optional store UUID; defaults to the configured demo store.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Maximum 100.' })
  @ApiOkResponse({
    description: 'Paginated inventory with actual quantities.',
    schema: { example: { data: { items: [{ productId: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', product: { name: 'Studio Wireless Headphones', sku: 'AUD-1001', isActive: true }, availableQuantity: 18, reservedQuantity: 2, sellableQuantity: 16, updatedAt: '2026-11-26T10:00:00.000Z' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid pagination query.' })
  list(@Headers('x-store-id') header: string | undefined, @Query() query: InventoryListQueryDto) {
    return this.inventory.list(this.storeContext.resolve(header), query);
  }

  @Get(':productId/availability')
  @ApiOperation({
    summary: 'Check whether a product is available to sell',
    description: 'Returns HTTP 200 with status out_of_stock and isAvailable=false when no sellable units remain.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'productId', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiOkResponse({
    description: 'Availability status and quantities, including an explicit out-of-stock result.',
    schema: { example: { data: { productId: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', availableQuantity: 0, reservedQuantity: 0, sellableQuantity: 0, isAvailable: false, status: 'out_of_stock', message: 'Product is out of stock.' } } },
  })
  @ApiNotFoundResponse({ description: 'Product not found in the selected store.' })
  availability(
    @Headers('x-store-id') header: string | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventory.availability(this.storeContext.resolve(header), productId);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get stock quantities for a product' })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'productId', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiOkResponse({
    description: 'Product identity, available stock, reservations, and derived sellable quantity.',
    schema: { example: { data: { productId: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', product: { name: 'Studio Wireless Headphones', sku: 'AUD-1001', isActive: true }, availableQuantity: 18, reservedQuantity: 2, sellableQuantity: 16 } } },
  })
  @ApiNotFoundResponse({ description: 'Product not found in the selected store.' })
  findByProduct(
    @Headers('x-store-id') header: string | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.inventory.findByProduct(this.storeContext.resolve(header), productId);
  }

  @Patch(':productId')
  @ApiOperation({
    summary: 'Set available inventory quantity',
    description: 'Sets physical stock while preserving current reservations. Changes are serialized per product; availableQuantity cannot be lower than reservedQuantity.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'productId', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiBody({
    type: UpdateInventoryDto,
    examples: { setStock: { summary: 'Set physical stock', value: { availableQuantity: 32 } } },
  })
  @ApiOkResponse({
    description: 'Updated stock quantities.',
    schema: { example: { data: { productId: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', availableQuantity: 32, reservedQuantity: 4, sellableQuantity: 28 } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid quantity or empty update.' })
  @ApiConflictResponse({ description: 'Requested quantities violate available/reserved stock limits.' })
  @ApiNotFoundResponse({ description: 'Product not found in the selected store.' })
  update(
    @Headers('x-store-id') header: string | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpdateInventoryDto,
  ) {
    return this.inventory.update(this.storeContext.resolve(header), productId, body);
  }

  @Post(':productId/adjustments')
  @ApiOperation({
    summary: 'Apply and audit a stock adjustment',
    description: 'quantityChange is a signed delta: positive receives stock and negative removes stock. An adjustment that would make inventory negative or reduce it below reserved stock is rejected atomically.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'productId', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiBody({
    type: CreateInventoryAdjustmentDto,
    examples: { receiveStock: { summary: 'Receive a shipment', value: { quantityChange: 8, reason: 'Receiving batch WH-204' } } },
  })
  @ApiCreatedResponse({
    description: 'Adjustment audit record and resulting inventory.',
    schema: { example: { data: { productId: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', availableQuantity: 26, reservedQuantity: 2, sellableQuantity: 24, adjustment: { quantityChange: 8, availableBefore: 18, availableAfter: 26, reason: 'Receiving batch WH-204' } } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid adjustment quantity or reason.' })
  @ApiConflictResponse({ description: 'Adjustment would make stock negative or less than reserved stock.' })
  @ApiNotFoundResponse({ description: 'Product not found in the selected store.' })
  adjust(
    @Headers('x-store-id') header: string | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: CreateInventoryAdjustmentDto,
  ) {
    return this.inventory.adjust(this.storeContext.resolve(header), productId, body);
  }
}
