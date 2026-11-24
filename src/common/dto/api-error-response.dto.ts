import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorBodyDto {
  @ApiProperty({ example: 'REQUEST_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiPropertyOptional({ type: [String], example: ['quantity must not be less than 1'] })
  details?: string[];
}

export class ApiErrorResponseDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty({ example: '/api/orders/draft' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-27T12:00:00.000Z' })
  timestamp!: string;
}
