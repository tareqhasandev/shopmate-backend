import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

const FILTER_QUERY_DOCS = [
  ApiQuery({ name: 'min_price', required: false, example: '10.00' }),
  ApiQuery({ name: 'max_price', required: false, example: '250.00' }),
  ApiQuery({ name: 'category', required: false, example: 'audio' }),
  ApiQuery({ name: 'brand', required: false, example: 'Northstar Audio' }),
  ApiQuery({ name: 'in_stock', required: false, enum: ['true', 'false'], example: 'true' }),
  ApiQuery({ name: 'sort_by', required: false, enum: ['name', 'price', 'brand', 'created_at'], example: 'price' }),
  ApiQuery({ name: 'sort_order', required: false, enum: ['asc', 'desc'], example: 'asc' }),
  ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
  ApiQuery({ name: 'limit', required: false, type: Number, example: 20 }),
];
const SEARCH_QUERY_DOC = ApiQuery({ name: 'search', required: false, example: 'wireless' });

function CatalogQueryDocs(includeSearch = true): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    for (const decorator of FILTER_QUERY_DOCS) decorator(target, propertyKey, descriptor!);
    if (includeSearch) SEARCH_QUERY_DOC(target, propertyKey, descriptor!);
  };
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Get()
  @CatalogQueryDocs()
  @ApiOperation({
    summary: 'List active products',
    description: 'Request example: GET /api/products?category=audio&in_stock=true&sort_by=price&sort_order=asc&page=1&limit=20. Only active products are returned.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false, description: 'Optional store UUID; defaults to the configured demo store.' })
  @ApiOkResponse({
    description: 'Paginated product results with category and actual stock summaries.',
    schema: { example: { data: { items: [{ id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Studio Wireless Headphones', price: '129', isFeatured: true, inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } },
  })
  list(@Headers('x-store-id') header: string | undefined, @Query() query: ProductQueryDto) {
    return this.products.list(this.storeContext.resolve(header), query);
  }

  @Get('search')
  @CatalogQueryDocs(false)
  @ApiOperation({
    summary: 'Search the active catalog',
    description: 'Request example: GET /api/products/search?search=wireless. Matches product name, brand, SKU, and tags; other catalog filters can be combined.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiQuery({ name: 'search', required: true, example: 'wireless' })
  @ApiOkResponse({
    description: 'Paginated matching products.',
    schema: { example: { data: { items: [{ id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Studio Wireless Headphones', sku: 'AUD-1001', inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } },
  })
  search(@Headers('x-store-id') header: string | undefined, @Query() query: ProductQueryDto) {
    return this.products.search(this.storeContext.resolve(header), query);
  }

  @Get('featured')
  @CatalogQueryDocs()
  @ApiOperation({
    summary: 'List featured active products',
    description: 'Request example: GET /api/products/featured?in_stock=true&page=1&limit=10. Featured products are paginated and may be filtered or sorted.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiOkResponse({
    description: 'Paginated featured products; inactive products are excluded.',
    schema: { example: { data: { items: [{ id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Studio Wireless Headphones', isFeatured: true, inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } }], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } } },
  })
  featured(@Headers('x-store-id') header: string | undefined, @Query() query: ProductQueryDto) {
    return this.products.featured(this.storeContext.resolve(header), query);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'List available catalog categories',
    description: 'Request example: GET /api/products/categories. Only categories with at least one active product are returned.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiOkResponse({
    description: 'Available categories and active product counts.',
    schema: { example: { data: { items: [{ id: '9aeab6ea-77e4-4cb0-9d93-905f227ccfa7', name: 'Audio', slug: 'audio', productCount: 3 }] } } },
  })
  categories(@Headers('x-store-id') header: string | undefined) {
    return this.products.categories(this.storeContext.resolve(header));
  }

  @Get('category/:slug')
  @CatalogQueryDocs()
  @ApiOperation({
    summary: 'List active products in a category',
    description: 'Request example: GET /api/products/category/audio?sort_by=price&sort_order=asc. The path category overrides the category query filter.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'slug', example: 'audio' })
  @ApiOkResponse({
    description: 'Paginated active products in the requested category.',
    schema: { example: { data: { items: [{ id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Studio Wireless Headphones', category: { name: 'Audio', slug: 'audio' }, inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } },
  })
  byCategory(
    @Headers('x-store-id') header: string | undefined,
    @Param('slug') slug: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.products.byCategory(this.storeContext.resolve(header), slug, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an active product by ID',
    description: 'Request example: GET /api/products/41d340a2-5e71-4a84-ae1d-1eb6f86d402a. UUID is the documented identifier; the Phase 1 slug form remains accepted for compatibility.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'id', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiOkResponse({
    description: 'Product details with category and current inventory.',
    schema: { example: { data: { id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Studio Wireless Headphones', sku: 'AUD-1001', price: '129', category: { name: 'Audio', slug: 'audio' }, inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } } } },
  })
  findById(@Headers('x-store-id') header: string | undefined, @Param('id') id: string) {
    return this.products.findById(this.storeContext.resolve(header), id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a product',
    description: 'Request example: POST /api/products with a product body and X-Store-Id. Creates active inventory with the supplied initialStock (reserved stock is zero). Public test mode allows unauthenticated writes only for the configured demo store; otherwise this write requires a bearer token.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiBody({
    type: CreateProductDto,
    examples: { createProduct: { summary: 'Create a stocked featured item', value: { name: 'Summit Ceramic Travel Mug', categoryId: 'e10b0c56-5f75-4e0a-9c55-b45a6f848c9d', description: 'A double-wall ceramic mug for daily commutes.', sku: 'MUG-6101', price: '28.50', brand: 'Northstar Home', imageUrl: 'https://cdn.example.com/products/summit-mug.jpg', tags: ['ceramic', 'travel'], initialStock: 12, isFeatured: true } } },
  })
  @ApiCreatedResponse({
    description: 'Created product including its inventory row.',
    schema: { example: { data: { id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', name: 'Summit Ceramic Travel Mug', sku: 'MUG-6101', isActive: true, isFeatured: true, inventory: { availableQuantity: 12, reservedQuantity: 0, sellableQuantity: 12 } } } },
  })
  create(@Headers('x-store-id') header: string | undefined, @Body() body: CreateProductDto) {
    return this.products.create(this.storeContext.resolve(header), body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a product',
    description: 'Request example: PATCH /api/products/41d340a2-5e71-4a84-ae1d-1eb6f86d402a with {"price":"26.00","availableQuantity":18}. Only supplied fields are updated.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'id', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiBody({ type: UpdateProductDto, examples: { updateProduct: { summary: 'Adjust price and stock', value: { price: '26.00', availableQuantity: 18, isFeatured: true } } } })
  @ApiOkResponse({
    description: 'Updated product with current inventory.',
    schema: { example: { data: { id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', price: '26', isFeatured: true, inventory: { availableQuantity: 18, reservedQuantity: 0, sellableQuantity: 18 } } } },
  })
  update(
    @Headers('x-store-id') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.products.update(this.storeContext.resolve(header), id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Safely deactivate a product',
    description: 'Request example: DELETE /api/products/41d340a2-5e71-4a84-ae1d-1eb6f86d402a. Products are soft-deactivated, not physically deleted, preserving order history. Public test mode allows unauthenticated writes only for the configured demo store; otherwise this write requires a bearer token.',
  })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  @ApiParam({ name: 'id', format: 'uuid', example: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a' })
  @ApiOkResponse({
    description: 'Deactivated product. It will no longer appear in public catalog results.',
    schema: { example: { data: { id: '41d340a2-5e71-4a84-ae1d-1eb6f86d402a', isActive: false, isFeatured: false } } },
  })
  deactivate(@Headers('x-store-id') header: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.deactivate(this.storeContext.resolve(header), id);
  }
}
