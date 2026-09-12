import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SERVICE_CATEGORIES, ServiceCategory } from './list-service.dto';

/**
 * Create/update payload for a service in the catalog. Used for both POST (all
 * required-ish fields present) and PUT (partial); the service layer only writes
 * the fields that were provided.
 */
export class UpsertServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? null : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  classTypeId?: number | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(SERVICE_CATEGORIES)
  category?: ServiceCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? null : String(value).toLowerCase()))
  @IsIn(['nutrition_session', 'inbody'])
  entitlementKey?: 'nutrition_session' | 'inbody' | null;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  durationMin?: number;

  /** Kept as a numeric string to preserve decimal precision for Prisma.Decimal. */
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : String(value)))
  @IsNumberString()
  price?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? null : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;
}
