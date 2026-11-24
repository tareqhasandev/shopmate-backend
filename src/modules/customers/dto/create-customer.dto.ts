import { IsEmail, IsOptional, IsString, Length, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Taylor Morgan', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  fullName!: string;

  @ApiProperty({ example: 'taylor@example.test', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: '+1-555-0100', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}
