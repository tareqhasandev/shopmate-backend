import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export class ProductQueryDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  @MaxLength(140)
  category?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  min_price?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN)
  max_price?: string;

  @IsOptional()
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[String(key)];
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  })
  @IsBoolean()
  in_stock?: boolean;

  @IsOptional()
  @IsIn(['name', 'price', 'brand', 'created_at'])
  sort_by: 'name' | 'price' | 'brand' | 'created_at' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_order: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
