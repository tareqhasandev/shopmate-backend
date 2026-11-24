import { OmitType, PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export class CreateProductDto {
  @ApiProperty({ example: 'Summit Ceramic Travel Mug' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ example: 'summit-ceramic-travel-mug', description: 'Lowercase URL slug; generated from name when omitted.' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(200)
  slug?: string;

  @ApiProperty({ format: 'uuid', example: 'e10b0c56-5f75-4e0a-9c55-b45a6f848c9d' })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  categoryId!: string;

  @ApiProperty({ example: 'A double-wall ceramic mug designed for daily commutes.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ example: 'MUG-6101' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sku!: string;

  @ApiProperty({ example: '28.50', description: 'Non-negative decimal with at most two fractional digits.' })
  @IsString()
  @Matches(MONEY_PATTERN)
  price!: string;

  @ApiPropertyOptional({ example: '34.00', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  compareAtPrice?: string | null;

  @ApiProperty({ example: 'Northstar Home' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  brand!: string;

  @ApiProperty({ example: 'https://cdn.example.com/products/summit-mug.jpg' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { capacityMl: 350, material: 'ceramic' } })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], example: ['ceramic', 'travel', 'commute'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ minimum: 0, example: 12, description: 'Initial available inventory; reserved stock starts at zero.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  initialStock?: number;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['initialStock'] as const)) {
  @ApiPropertyOptional({ minimum: 0, example: 18, description: 'Set actual available stock; cannot be lower than reserved stock.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  availableQuantity?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
