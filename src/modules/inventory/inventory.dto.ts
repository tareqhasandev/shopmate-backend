import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, NotEquals } from 'class-validator';

const MAX_QUANTITY = 2_147_483_647;

export class InventoryListQueryDto {
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
}

export class UpdateInventoryDto {
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_QUANTITY, example: 32 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  availableQuantity?: number;


}

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ minimum: -MAX_QUANTITY, maximum: MAX_QUANTITY, example: 8, description: 'Signed integer adjustment; positive adds units and negative removes units.' })
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_QUANTITY)
  @Max(MAX_QUANTITY)
  @NotEquals(0)
  quantityChange!: number;

  @ApiProperty({ maxLength: 300, example: 'Receiving batch WH-204' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
