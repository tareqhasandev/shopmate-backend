import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/dto/api-error-response.dto';
import { StoreContextService } from '../../common/store/store-context.service';
import {
  CreateDraftOrderDto,
  OrderListQueryDto,
  UpdateDraftOrderDto,
  UpdateDraftOrderItemDto,
} from './dto/create-draft-order.dto';
import { OrdersService } from './orders.service';

const ORDER_EXAMPLE = {
  data: {
    id: '55e3c329-19e0-4e28-9641-c67b97542a23',
    orderNumber: 'SM-MI2G-8F4A6B2C1D0E',
    status: 'DRAFT',
    paymentStatus: 'NOT_PROCESSED',
    subtotal: '24.50',
    total: '24.50',
    currency: 'USD',
    items: [{ productId: '55e3c329-19e0-4e28-9641-c67b97542a23', productName: 'Demo Mug', sku: 'MUG-6101', unitPrice: '24.50', quantity: 1, lineTotal: '24.50' }],
  },
};

@ApiTags('orders')
@ApiHeader({ name: 'X-Store-Id', required: false, description: 'Store scope; this is not an authentication credential.' })
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Post('draft')
  @ApiOperation({ summary: 'Create a draft from cart items or supplied product IDs; reserves stock but never processes payment' })
  @ApiCreatedResponse({ description: 'Draft created with database-priced line-item snapshots.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Invalid body, client-supplied prices, or cart with no items.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Store, cart, customer, or active product not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Requested quantity exceeds current sellable inventory.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  createDraft(@Headers('x-store-id') header: string | undefined, @Body() dto: CreateDraftOrderDto) {
    return this.orders.createDraft(this.storeContext.resolve(header), dto);
  }

  @Post('drafts')
  @ApiOperation({ summary: 'Legacy plural alias for creating a draft order; no payment is processed', deprecated: true })
  @ApiCreatedResponse({ description: 'Draft created with database-priced line-item snapshots.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Invalid body, client-supplied prices, or cart with no items.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Store, cart, customer, or active product not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Requested quantity exceeds current sellable inventory.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  createDraftLegacy(@Headers('x-store-id') header: string | undefined, @Body() dto: CreateDraftOrderDto) {
    return this.orders.createDraft(this.storeContext.resolve(header), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List orders in the selected store, optionally filtered by lifecycle status' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'] })
  @ApiOkResponse({ description: 'Paginated orders; paymentStatus is always NOT_PROCESSED for this API.', schema: { example: { data: { items: [ORDER_EXAMPLE.data], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } })
  @ApiBadRequestResponse({ description: 'Invalid pagination or status filter.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  list(@Headers('x-store-id') header: string | undefined, @Query() query: OrderListQueryDto) {
    return this.orders.list(this.storeContext.resolve(header), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve an order and its price snapshots, reservation state, and payment status' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Order detail. Confirmed means confirmed but unpaid; paymentStatus remains NOT_PROCESSED.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Order ID is not a UUID.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found in the selected store.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  findById(@Headers('x-store-id') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.findById(this.storeContext.resolve(header), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer or notes on a draft; prices, totals, and lifecycle status are server-controlled' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated draft; totals and price snapshots are unchanged.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Invalid order ID or update body (including attempted price/total changes).', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order or customer not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Only DRAFT orders can be updated.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  updateDraft(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDraftOrderDto,
  ) {
    return this.orders.updateDraft(this.storeContext.resolve(header), id, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Set a draft line quantity, adjust its reservation, and recalculate totals using the stored price snapshot' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated draft line, reservations, subtotal, and total.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Invalid path ID, quantity, or attempted client price.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order or line item not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Order is not a draft, reservation is inconsistent, or requested quantity exceeds sellable stock.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  updateItem(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateDraftOrderItemDto,
  ) {
    return this.orders.updateItem(this.storeContext.resolve(header), id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove a draft line, release its reservation, and recalculate totals' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated draft after item removal.', schema: { example: ORDER_EXAMPLE } })
  @ApiBadRequestResponse({ description: 'Order or item ID is not a UUID.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order or line item not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Order is not a draft or its reservation cannot be released safely.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  removeItem(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.orders.removeItem(this.storeContext.resolve(header), id, itemId);
  }

  @Post(':id/confirm-draft')
  @ApiOperation({ summary: 'Confirm a non-empty draft while keeping its reservation; confirmation does not charge the customer' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Order status becomes CONFIRMED; paymentStatus remains NOT_PROCESSED and no payment is initiated.', schema: { example: { data: { ...ORDER_EXAMPLE.data, status: 'CONFIRMED', paymentStatus: 'NOT_PROCESSED' } } } })
  @ApiBadRequestResponse({ description: 'Order ID is not a UUID.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Order is not a DRAFT, is empty, or its inventory reservation is inconsistent.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  confirmDraft(@Headers('x-store-id') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.confirmDraft(this.storeContext.resolve(header), id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Legacy draft cancellation endpoint; releases its stock reservation without payment activity' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Draft status becomes CANCELLED and reserved stock is released.', schema: { example: { data: { ...ORDER_EXAMPLE.data, status: 'CANCELLED' } } } })
  @ApiBadRequestResponse({ description: 'Order ID is not a UUID.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found in the selected store.', type: ApiErrorResponseDto })
  @ApiConflictResponse({ description: 'Only DRAFT orders can be cancelled or reservation is inconsistent.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Unexpected server failure using the standard error envelope.', type: ApiErrorResponseDto })
  cancelDraft(@Headers('x-store-id') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.cancelDraft(this.storeContext.resolve(header), id);
  }
}
