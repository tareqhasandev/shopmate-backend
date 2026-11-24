import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CartItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Product to add to the cart.' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 100, example: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateCartDto {
  @ApiPropertyOptional({
    type: [CartItemInputDto],
    maxItems: 50,
    description: 'Optional initial products. Omit or pass an empty array to create an empty cart.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemInputDto)
  items?: CartItemInputDto[];
}

export class AddCartItemDto extends CartItemInputDto {}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 100, example: 2, description: 'New total quantity for this cart line.' })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}
