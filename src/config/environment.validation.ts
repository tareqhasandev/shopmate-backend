import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, validateSync } from 'class-validator';

const DEFAULT_STORE_ID = '00000000-0000-4000-8000-000000000001';

export class EnvironmentVariables {
  @Matches(/^postgres(?:ql)?:\/\/\S+$/i, { message: 'DATABASE_URL must be a PostgreSQL connection URL' })
  DATABASE_URL!: string;

  @Transform(({ value }) => value === undefined ? 3001 : Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  CORS_ORIGINS = 'http://localhost:3000';

  @IsOptional()
  @IsUUID()
  SHOPMATE_DEFAULT_STORE_ID = DEFAULT_STORE_ID;

  @IsOptional()
  @IsUUID()
  SHOPMATE_API_STORE_ID?: string;

  @Transform(({ value }) => value === '' ? undefined : value)
  @IsOptional()
  @IsString()
  @MinLength(32)
  SHOPMATE_API_TOKEN?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === false || value === 'false') return false;
    if (value === true || value === 'true') return true;
    return value;
  })
  @IsBoolean()
  SHOPMATE_PUBLIC_TEST_API = false;

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const environment = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(environment, { skipMissingProperties: false });
  if (environment.NODE_ENV !== 'test' && !environment.SHOPMATE_PUBLIC_TEST_API && !environment.SHOPMATE_API_TOKEN) {
    throw new Error('SHOPMATE_API_TOKEN is required unless SHOPMATE_PUBLIC_TEST_API=true');
  }
  if (errors.length > 0) {
    const names = errors.map(({ property }) => property).join(', ');
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  return environment;
}
