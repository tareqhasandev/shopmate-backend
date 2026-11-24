import { DraftOrderStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DraftOrderItemDto {
  @ApiProperty({ format: 'uuid', description: 'Product to reserve in this draft.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 100, example: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateDraftOrderDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cart to copy into this order. The cart is left unchanged.' })
  @IsOptional()
  @IsUUID()
  cartId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Previously created customer ID in this store.' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    type: [DraftOrderItemDto],
    minItems: 1,
    maxItems: 50,
    description: 'Direct product lines. Provide these or cartId, but not both. Prices are always taken from the database.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DraftOrderItemDto)
  items?: DraftOrderItemDto[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDraftOrderDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Replace the customer on the draft, or pass null to clear it.',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({
    maxLength: 2000,
    nullable: true,
    description: 'Update the draft note or pass null/empty text to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateDraftOrderItemDto {
  @ApiProperty({ minimum: 1, maximum: 100, example: 2, description: 'New total quantity for this order line.' })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class OrderListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: DraftOrderStatus, description: 'Optional status filter. No PAID state exists.' })
  @IsOptional()
  @IsEnum(DraftOrderStatus)
  status?: DraftOrderStatus;
}
