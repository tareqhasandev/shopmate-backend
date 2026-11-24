import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreContextService } from '../../common/store/store-context.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly storeContext: StoreContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create or update the caller-provided customer profile' })
  @ApiHeader({ name: 'X-Store-Id', required: false })
  create(@Headers('x-store-id') header: string | undefined, @Body() dto: CreateCustomerDto) {
    return this.customers.create(this.storeContext.resolve(header), dto);
  }
}
