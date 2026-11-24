import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List categories for the selected store' })
  @ApiHeader({ name: 'X-Store-Id', required: false, description: 'Optional store UUID; defaults to the configured demo store.' })
  list(@Headers('x-store-id') header?: string) {
    return this.categories.list(this.storeContext.resolve(header));
  }
}
