import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { AddCartItemDto, CreateCartDto, UpdateCartItemDto } from './cart.dto';
import { CartService } from './cart.service';

@ApiTags('cart')
@Controller('cart')
@ApiHeader({ name: 'X-Store-Id', required: false, description: 'Store scope; this is not an authentication credential.' })
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an empty cart or create one with initial products' })
  @ApiCreatedResponse({ description: 'Cart created with current database prices and a recalculated subtotal.' })
  @ApiBadRequestResponse({ description: 'Cart items or quantities are invalid.' })
  @ApiConflictResponse({ description: 'Requested quantity exceeds the product’s current sellable stock.' })
  @ApiNotFoundResponse({ description: 'Store or product not found in the selected store.' })
  create(@Headers('x-store-id') header: string | undefined, @Body() dto: CreateCartDto) {
    return this.carts.create(this.storeContext.resolve(header), dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a cart and calculate current prices and subtotal' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Cart contents, current stock availability, and recalculated subtotal.' })
  @ApiBadRequestResponse({ description: 'Cart ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Cart not found in the selected store.' })
  findById(@Headers('x-store-id') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.carts.findById(this.storeContext.resolve(header), id);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add a product to a cart, merging quantity for an existing product line' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ description: 'Updated cart with totals calculated from current database prices.' })
  @ApiBadRequestResponse({ description: 'Product ID or quantity is invalid.' })
  @ApiConflictResponse({ description: 'Requested cart quantity exceeds the product’s current sellable stock.' })
  @ApiNotFoundResponse({ description: 'Cart or active product not found in the selected store.' })
  addItem(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.carts.addItem(this.storeContext.resolve(header), id, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Set a cart item’s total quantity and recalculate totals' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated cart with current database prices and subtotal.' })
  @ApiBadRequestResponse({ description: 'Cart item ID or quantity is invalid.' })
  @ApiConflictResponse({ description: 'Requested quantity exceeds the product’s current sellable stock.' })
  @ApiNotFoundResponse({ description: 'Cart or item not found in the selected store.' })
  updateItem(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.carts.updateItem(this.storeContext.resolve(header), id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove a product line from the cart and recalculate the subtotal' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated cart after removing the item.' })
  @ApiBadRequestResponse({ description: 'Cart or item ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Cart or item not found in the selected store.' })
  removeItem(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.carts.removeItem(this.storeContext.resolve(header), id, itemId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a cart and its items; cart contents do not reserve inventory' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Cart deleted.' })
  @ApiBadRequestResponse({ description: 'Cart ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Cart not found in the selected store.' })
  remove(@Headers('x-store-id') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.carts.remove(this.storeContext.resolve(header), id);
  }
}
