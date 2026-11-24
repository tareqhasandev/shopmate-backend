import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AiAgentChatRequestDto {
  @ApiProperty({ example: 'Show me ceramic mugs under $30', maxLength: 4000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omit on the first turn; reuse the returned ID to continue.' })
  @IsOptional()
  @IsUUID('4')
  conversationId?: string;
}

export class AiAgentChatToolExecutionDto {
  @ApiProperty({ example: 'search_products' })
  name!: string;

  @ApiProperty({ enum: ['succeeded', 'failed'] })
  status!: 'succeeded' | 'failed';
}

export class AiAgentChatResponseDto {
  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ example: 'I found 3 ceramic mugs under $30. The lowest-priced option is…' })
  reply!: string;

  @ApiProperty({ enum: ['deterministic_fallback'], description: 'Current selector; no model provider is configured in this backend.' })
  mode!: 'deterministic_fallback';

  @ApiProperty({ type: [AiAgentChatToolExecutionDto] })
  toolExecutions!: AiAgentChatToolExecutionDto[];
}
